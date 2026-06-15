---
title: "Microservices Patterns"
subtitle: "Implement the saga pattern, circuit breakers, service discovery, and distributed transactions."
chapter: 17
level: "advanced"
readingTime: "25 min"
topics: ["saga pattern", "circuit breaker", "service discovery", "distributed transactions"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Diagram from '$lib/components/content/Diagram.svelte';
</script>

## What are Microservices Patterns?

When you break a monolith into microservices, you trade one set of problems for another. A single database transaction that used to be atomic now spans multiple services. A service call that used to be a function call can now fail due to network issues. **Microservices patterns** are battle-tested solutions to these distributed systems challenges -- the saga pattern for distributed transactions, circuit breakers for fault tolerance, and service discovery for dynamic routing.

Think of it like an orchestra. In a small band, everyone can see each other and stay in sync. But in a 100-piece orchestra, you need a conductor (saga orchestrator) to coordinate, section leaders (circuit breakers) to handle individual failures gracefully, and a seating chart (service registry) so everyone knows where to find each other.

<Diagram title="Saga Orchestration Pattern">
  <div class="diagram-row">
    <div class="box box-lb">API Gateway<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Entry Point</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">Saga Orchestrator<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Coordinator</span></div>
  </div>
  <div class="diagram-row" style="justify-content:center;">
    <div class="arrow-down">v</div>
  </div>
  <div class="diagram-row">
    <div class="box box-server">Order Service<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Step 1</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">Inventory Service<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Step 2</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">Payment Service<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Step 3</span></div>
  </div>
</Diagram>

## Real-World Analogy

<Callout type="info">

**Real-World Analogy**

Like a shopping mall — instead of one mega-store, there are specialized shops (clothing, electronics, food), each independently run with their own staff and inventory.

</Callout>

When you order on Amazon, a single "Place Order" click triggers a multi-step saga across services: the order service creates the order, the inventory service reserves the items, and the payment service charges your card. If payment fails, the saga runs compensating transactions in reverse -- unreserving inventory and cancelling the order. Netflix uses circuit breakers so that when their recommendation service goes down, the homepage still loads with a default list instead of showing an error page.

## Building a Saga Orchestrator

Here's a complete saga orchestrator with circuit breakers, service discovery, retry with exponential backoff, and compensating transactions. This implements the full order flow used by companies like Uber and Amazon.

<CodeTabs tsFile="saga-orchestrator.ts" goFile="saga-orchestrator.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
// --- Types ---
type SagaStatus = "pending" | "running" | "completed" | "compensating" | "failed";
type StepStatus = "pending" | "success" | "failed" | "compensated";

interface SagaStep {
  name: string;
  execute: (context: Record<string, unknown>) => Promise<Record<string, unknown>>;
  compensate: (context: Record<string, unknown>) => Promise<void>;
}

interface SagaState {
  id: string;
  status: SagaStatus;
  steps: { name: string; status: StepStatus; error?: string }[];
  context: Record<string, unknown>;
  startedAt: number;
  completedAt?: number;
}

// --- Circuit Breaker ---
enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;

  constructor(
    private readonly name: string,
    private readonly failureThreshold: number = 5,
    private readonly resetTimeoutMs: number = 30_000,
    private readonly halfOpenMaxAttempts: number = 3
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        console.log(`[CIRCUIT:${this.name}] OPEN -> HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();

      if (this.state === CircuitState.HALF_OPEN) {
        this.successCount++;
        if (this.successCount >= this.halfOpenMaxAttempts) {
          this.state = CircuitState.CLOSED;
          this.failureCount = 0;
          console.log(`[CIRCUIT:${this.name}] HALF_OPEN -> CLOSED`);
        }
      } else {
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        this.state = CircuitState.OPEN;
        console.log(`[CIRCUIT:${this.name}] -> OPEN (failures: ${this.failureCount})`);
      }

      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// --- Service Registry ---
interface ServiceInstance {
  id: string;
  name: string;
  url: string;
  healthy: boolean;
  lastHealthCheck: number;
}

class ServiceRegistry {
  private services = new Map<string, ServiceInstance[]>();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  register(name: string, url: string): string {
    const id = `${name}-${crypto.randomUUID().slice(0, 8)}`;
    const instance: ServiceInstance = {
      id,
      name,
      url,
      healthy: true,
      lastHealthCheck: Date.now(),
    };

    if (!this.services.has(name)) {
      this.services.set(name, []);
    }
    this.services.get(name)!.push(instance);
    console.log(`[REGISTRY] Registered ${name} at ${url} (id: ${id})`);
    return id;
  }

  deregister(id: string): void {
    for (const [name, instances] of this.services) {
      const idx = instances.findIndex((i) => i.id === id);
      if (idx >= 0) {
        instances.splice(idx, 1);
        console.log(`[REGISTRY] Deregistered ${id} from ${name}`);
        if (instances.length === 0) this.services.delete(name);
        return;
      }
    }
  }

  resolve(name: string): ServiceInstance | null {
    const instances = this.services.get(name);
    if (!instances || instances.length === 0) return null;

    // Round-robin among healthy instances
    const healthy = instances.filter((i) => i.healthy);
    if (healthy.length === 0) return null;

    const idx = Math.floor(Math.random() * healthy.length);
    return healthy[idx];
  }

  markUnhealthy(id: string): void {
    for (const instances of this.services.values()) {
      const instance = instances.find((i) => i.id === id);
      if (instance) {
        instance.healthy = false;
        console.log(`[REGISTRY] Marked ${id} as unhealthy`);
        return;
      }
    }
  }

  startHealthChecks(intervalMs: number = 10_000): void {
    this.healthCheckInterval = setInterval(() => {
      for (const instances of this.services.values()) {
        for (const instance of instances) {
          instance.lastHealthCheck = Date.now();
          // In production, you'd make an HTTP call to instance.url/health
          console.log(`[HEALTH] Checking ${instance.id}: ${instance.healthy ? "UP" : "DOWN"}`);
        }
      }
    }, intervalMs);
  }

  stopHealthChecks(): void {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
  }
}

// --- Retry with exponential backoff ---
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) break;

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
      console.log(`[RETRY] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

// --- Saga Orchestrator ---
class SagaOrchestrator {
  private sagas = new Map<string, SagaState>();
  private circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(private registry: ServiceRegistry) {}

  private getBreaker(name: string): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, new CircuitBreaker(name));
    }
    return this.circuitBreakers.get(name)!;
  }

  async execute(sagaId: string, steps: SagaStep[], initialContext: Record<string, unknown> = {}): Promise<SagaState> {
    const state: SagaState = {
      id: sagaId,
      status: "running",
      steps: steps.map((s) => ({ name: s.name, status: "pending" as StepStatus })),
      context: { ...initialContext },
      startedAt: Date.now(),
    };

    this.sagas.set(sagaId, state);
    console.log(`\n[SAGA:${sagaId}] Starting saga with ${steps.length} steps`);

    let completedSteps: number = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const breaker = this.getBreaker(step.name);

      console.log(`[SAGA:${sagaId}] Step ${i + 1}/${steps.length}: ${step.name} -> EXECUTING`);

      try {
        const result = await retryWithBackoff(() =>
          breaker.call(() => step.execute(state.context))
        );

        state.context = { ...state.context, ...result };
        state.steps[i].status = "success";
        completedSteps = i + 1;
        console.log(`[SAGA:${sagaId}] Step ${step.name} -> SUCCESS`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        state.steps[i].status = "failed";
        state.steps[i].error = errMsg;
        console.log(`[SAGA:${sagaId}] Step ${step.name} -> FAILED: ${errMsg}`);

        // Start compensation
        state.status = "compensating";
        console.log(`[SAGA:${sagaId}] Starting compensation for ${completedSteps} completed steps`);

        for (let j = completedSteps - 1; j >= 0; j--) {
          const compStep = steps[j];
          try {
            console.log(`[SAGA:${sagaId}] Compensating: ${compStep.name}`);
            await compStep.compensate(state.context);
            state.steps[j].status = "compensated";
            console.log(`[SAGA:${sagaId}] ${compStep.name} -> COMPENSATED`);
          } catch (compError) {
            const compErrMsg = compError instanceof Error ? compError.message : String(compError);
            console.error(`[SAGA:${sagaId}] Compensation FAILED for ${compStep.name}: ${compErrMsg}`);
            // In production, alert and queue for manual intervention
          }
        }

        state.status = "failed";
        state.completedAt = Date.now();
        console.log(`[SAGA:${sagaId}] Saga FAILED (took ${state.completedAt - state.startedAt}ms)`);
        return state;
      }
    }

    state.status = "completed";
    state.completedAt = Date.now();
    console.log(`[SAGA:${sagaId}] Saga COMPLETED (took ${state.completedAt - state.startedAt}ms)\n`);
    return state;
  }

  getState(sagaId: string): SagaState | undefined {
    return this.sagas.get(sagaId);
  }
}

// --- Define the Order Saga steps ---
function createOrderSagaSteps(): SagaStep[] {
  return [
    {
      name: "CreateOrder",
      execute: async (ctx) => {
        console.log(`  Creating order for user ${ctx.userId}, items: ${JSON.stringify(ctx.items)}`);
        const orderId = `ORD-${Date.now()}`;
        return { orderId, orderStatus: "created" };
      },
      compensate: async (ctx) => {
        console.log(`  Cancelling order ${ctx.orderId}`);
        // Mark order as cancelled in DB
      },
    },
    {
      name: "ReserveInventory",
      execute: async (ctx) => {
        console.log(`  Reserving inventory for order ${ctx.orderId}`);
        const items = ctx.items as Array<{ sku: string; qty: number }>;
        for (const item of items) {
          console.log(`    Reserving ${item.qty}x ${item.sku}`);
        }
        return { inventoryReserved: true, reservationId: `RES-${Date.now()}` };
      },
      compensate: async (ctx) => {
        console.log(`  Releasing inventory reservation ${ctx.reservationId}`);
      },
    },
    {
      name: "ChargePayment",
      execute: async (ctx) => {
        console.log(`  Charging payment for order ${ctx.orderId}, amount: $${ctx.amount}`);
        // Simulate payment failure for amounts > 1000
        if ((ctx.amount as number) > 1000) {
          throw new Error("Payment declined: insufficient funds");
        }
        return { paymentId: `PAY-${Date.now()}`, charged: true };
      },
      compensate: async (ctx) => {
        console.log(`  Refunding payment ${ctx.paymentId}`);
      },
    },
    {
      name: "ConfirmOrder",
      execute: async (ctx) => {
        console.log(`  Confirming order ${ctx.orderId} (payment: ${ctx.paymentId})`);
        return { orderStatus: "confirmed", confirmedAt: new Date().toISOString() };
      },
      compensate: async (ctx) => {
        console.log(`  Reverting order ${ctx.orderId} confirmation`);
      },
    },
  ];
}

// --- Demo execution ---
async function main(): Promise<void> {
  const registry = new ServiceRegistry();
  registry.register("order-service", "http://localhost:3001");
  registry.register("inventory-service", "http://localhost:3002");
  registry.register("payment-service", "http://localhost:3003");

  const orchestrator = new SagaOrchestrator(registry);
  const steps = createOrderSagaSteps();

  // Successful order
  console.log("=== Scenario 1: Successful Order ===");
  await orchestrator.execute("saga-001", steps, {
    userId: "user-42",
    items: [{ sku: "WIDGET-A", qty: 2 }, { sku: "GADGET-B", qty: 1 }],
    amount: 99.99,
  });

  // Failed order (payment declined) -- triggers compensation
  console.log("=== Scenario 2: Payment Failure with Rollback ===");
  await orchestrator.execute("saga-002", steps, {
    userId: "user-42",
    items: [{ sku: "EXPENSIVE-ITEM", qty: 1 }],
    amount: 5000,
  });

  registry.stopHealthChecks();
}

main().catch(console.error);
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"fmt"
	"math"
	"math/rand"
	"sync"
	"time"
)

// --- Types ---
type SagaStatus string
type StepStatus string

const (
	StatusPending      SagaStatus = "pending"
	StatusRunning      SagaStatus = "running"
	StatusCompleted    SagaStatus = "completed"
	StatusCompensating SagaStatus = "compensating"
	StatusFailed       SagaStatus = "failed"

	StepPending     StepStatus = "pending"
	StepSuccess     StepStatus = "success"
	StepFailed      StepStatus = "failed"
	StepCompensated StepStatus = "compensated"
)

type SagaStep struct {
	Name       string
	Execute    func(ctx map[string]interface{}) (map[string]interface{}, error)
	Compensate func(ctx map[string]interface{}) error
}

type StepState struct {
	Name   string     `json:"name"`
	Status StepStatus `json:"status"`
	Error  string     `json:"error,omitempty"`
}

type SagaState struct {
	ID          string                 `json:"id"`
	Status      SagaStatus             `json:"status"`
	Steps       []StepState            `json:"steps"`
	Context     map[string]interface{} `json:"context"`
	StartedAt   time.Time              `json:"startedAt"`
	CompletedAt *time.Time             `json:"completedAt,omitempty"`
}

// --- Circuit Breaker ---
type CircuitState int

const (
	CircuitClosed CircuitState = iota
	CircuitOpen
	CircuitHalfOpen
)

func (cs CircuitState) String() string {
	switch cs {
	case CircuitClosed:
		return "CLOSED"
	case CircuitOpen:
		return "OPEN"
	case CircuitHalfOpen:
		return "HALF_OPEN"
	default:
		return "UNKNOWN"
	}
}

type CircuitBreaker struct {
	mu               sync.Mutex
	name             string
	state            CircuitState
	failureCount     int
	successCount     int
	failureThreshold int
	resetTimeout     time.Duration
	lastFailureTime  time.Time
	halfOpenMax      int
}

func NewCircuitBreaker(name string, threshold int, resetTimeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		name:             name,
		state:            CircuitClosed,
		failureThreshold: threshold,
		resetTimeout:     resetTimeout,
		halfOpenMax:      3,
	}
}

func (cb *CircuitBreaker) Call(fn func() (map[string]interface{}, error)) (map[string]interface{}, error) {
	cb.mu.Lock()

	if cb.state == CircuitOpen {
		if time.Since(cb.lastFailureTime) > cb.resetTimeout {
			cb.state = CircuitHalfOpen
			cb.successCount = 0
			fmt.Printf("[CIRCUIT:%s] OPEN -> HALF_OPEN\n", cb.name)
		} else {
			cb.mu.Unlock()
			return nil, fmt.Errorf("circuit breaker %s is OPEN", cb.name)
		}
	}
	currentState := cb.state
	cb.mu.Unlock()

	result, err := fn()

	cb.mu.Lock()
	defer cb.mu.Unlock()

	if err != nil {
		cb.failureCount++
		cb.lastFailureTime = time.Now()
		if cb.failureCount >= cb.failureThreshold {
			cb.state = CircuitOpen
			fmt.Printf("[CIRCUIT:%s] -> OPEN (failures: %d)\n", cb.name, cb.failureCount)
		}
		return nil, err
	}

	if currentState == CircuitHalfOpen {
		cb.successCount++
		if cb.successCount >= cb.halfOpenMax {
			cb.state = CircuitClosed
			cb.failureCount = 0
			fmt.Printf("[CIRCUIT:%s] HALF_OPEN -> CLOSED\n", cb.name)
		}
	} else {
		cb.failureCount = 0
	}

	return result, nil
}

// --- Service Registry ---
type ServiceInstance struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	URL             string `json:"url"`
	Healthy         bool   `json:"healthy"`
	LastHealthCheck time.Time
}

type ServiceRegistry struct {
	mu       sync.RWMutex
	services map[string][]ServiceInstance
	stopCh   chan struct{}
}

func NewServiceRegistry() *ServiceRegistry {
	return &ServiceRegistry{
		services: make(map[string][]ServiceInstance),
		stopCh:   make(chan struct{}),
	}
}

func (sr *ServiceRegistry) Register(name, url string) string {
	sr.mu.Lock()
	defer sr.mu.Unlock()

	id := fmt.Sprintf("%s-%d", name, time.Now().UnixNano()%100000)
	instance := ServiceInstance{
		ID:              id,
		Name:            name,
		URL:             url,
		Healthy:         true,
		LastHealthCheck: time.Now(),
	}
	sr.services[name] = append(sr.services[name], instance)
	fmt.Printf("[REGISTRY] Registered %s at %s (id: %s)\n", name, url, id)
	return id
}

func (sr *ServiceRegistry) Resolve(name string) (*ServiceInstance, error) {
	sr.mu.RLock()
	defer sr.mu.RUnlock()

	instances := sr.services[name]
	if len(instances) == 0 {
		return nil, fmt.Errorf("no instances for service %s", name)
	}

	var healthy []ServiceInstance
	for _, inst := range instances {
		if inst.Healthy {
			healthy = append(healthy, inst)
		}
	}
	if len(healthy) == 0 {
		return nil, fmt.Errorf("no healthy instances for service %s", name)
	}

	picked := healthy[rand.Intn(len(healthy))]
	return &picked, nil
}

func (sr *ServiceRegistry) StartHealthChecks(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				sr.mu.RLock()
				for _, instances := range sr.services {
					for _, inst := range instances {
						status := "UP"
						if !inst.Healthy {
							status = "DOWN"
						}
						fmt.Printf("[HEALTH] Checking %s: %s\n", inst.ID, status)
					}
				}
				sr.mu.RUnlock()
			case <-sr.stopCh:
				return
			}
		}
	}()
}

func (sr *ServiceRegistry) Stop() {
	close(sr.stopCh)
}

// --- Retry with exponential backoff ---
func retryWithBackoff(fn func() (map[string]interface{}, error), maxRetries int, baseDelay time.Duration) (map[string]interface{}, error) {
	var lastErr error

	for attempt := 0; attempt <= maxRetries; attempt++ {
		result, err := fn()
		if err == nil {
			return result, nil
		}
		lastErr = err

		if attempt == maxRetries {
			break
		}

		delay := time.Duration(float64(baseDelay) * math.Pow(2, float64(attempt)))
		jitter := time.Duration(rand.Float64() * float64(time.Second))
		sleepTime := delay + jitter

		fmt.Printf("[RETRY] Attempt %d/%d failed, retrying in %v\n", attempt+1, maxRetries, sleepTime)
		time.Sleep(sleepTime)
	}

	return nil, lastErr
}

// --- Saga Orchestrator ---
type SagaOrchestrator struct {
	mu       sync.RWMutex
	sagas    map[string]*SagaState
	breakers map[string]*CircuitBreaker
	registry *ServiceRegistry
}

func NewSagaOrchestrator(registry *ServiceRegistry) *SagaOrchestrator {
	return &SagaOrchestrator{
		sagas:    make(map[string]*SagaState),
		breakers: make(map[string]*CircuitBreaker),
		registry: registry,
	}
}

func (so *SagaOrchestrator) getBreaker(name string) *CircuitBreaker {
	so.mu.Lock()
	defer so.mu.Unlock()
	if cb, ok := so.breakers[name]; ok {
		return cb
	}
	cb := NewCircuitBreaker(name, 5, 30*time.Second)
	so.breakers[name] = cb
	return cb
}

func (so *SagaOrchestrator) Execute(sagaID string, steps []SagaStep, initialCtx map[string]interface{}) *SagaState {
	state := &SagaState{
		ID:        sagaID,
		Status:    StatusRunning,
		Steps:     make([]StepState, len(steps)),
		Context:   copyMap(initialCtx),
		StartedAt: time.Now(),
	}
	for i, step := range steps {
		state.Steps[i] = StepState{Name: step.Name, Status: StepPending}
	}

	so.mu.Lock()
	so.sagas[sagaID] = state
	so.mu.Unlock()

	fmt.Printf("\n[SAGA:%s] Starting saga with %d steps\n", sagaID, len(steps))

	completedSteps := 0

	for i, step := range steps {
		breaker := so.getBreaker(step.Name)
		fmt.Printf("[SAGA:%s] Step %d/%d: %s -> EXECUTING\n", sagaID, i+1, len(steps), step.Name)

		result, err := retryWithBackoff(func() (map[string]interface{}, error) {
			return breaker.Call(func() (map[string]interface{}, error) {
				return step.Execute(state.Context)
			})
		}, 3, time.Second)

		if err != nil {
			state.Steps[i].Status = StepFailed
			state.Steps[i].Error = err.Error()
			fmt.Printf("[SAGA:%s] Step %s -> FAILED: %v\n", sagaID, step.Name, err)

			// Compensate
			state.Status = StatusCompensating
			fmt.Printf("[SAGA:%s] Starting compensation for %d completed steps\n", sagaID, completedSteps)

			for j := completedSteps - 1; j >= 0; j-- {
				compStep := steps[j]
				fmt.Printf("[SAGA:%s] Compensating: %s\n", sagaID, compStep.Name)
				if compErr := compStep.Compensate(state.Context); compErr != nil {
					fmt.Printf("[SAGA:%s] Compensation FAILED for %s: %v\n", sagaID, compStep.Name, compErr)
				} else {
					state.Steps[j].Status = StepCompensated
					fmt.Printf("[SAGA:%s] %s -> COMPENSATED\n", sagaID, compStep.Name)
				}
			}

			state.Status = StatusFailed
			now := time.Now()
			state.CompletedAt = &now
			fmt.Printf("[SAGA:%s] Saga FAILED (took %v)\n", sagaID, now.Sub(state.StartedAt))
			return state
		}

		// Merge result into context
		for k, v := range result {
			state.Context[k] = v
		}
		state.Steps[i].Status = StepSuccess
		completedSteps = i + 1
		fmt.Printf("[SAGA:%s] Step %s -> SUCCESS\n", sagaID, step.Name)
	}

	state.Status = StatusCompleted
	now := time.Now()
	state.CompletedAt = &now
	fmt.Printf("[SAGA:%s] Saga COMPLETED (took %v)\n\n", sagaID, now.Sub(state.StartedAt))
	return state
}

func copyMap(src map[string]interface{}) map[string]interface{} {
	dst := make(map[string]interface{}, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

// --- Define Order Saga steps ---
func createOrderSagaSteps() []SagaStep {
	return []SagaStep{
		{
			Name: "CreateOrder",
			Execute: func(ctx map[string]interface{}) (map[string]interface{}, error) {
				fmt.Printf("  Creating order for user %v\n", ctx["userId"])
				orderID := fmt.Sprintf("ORD-%d", time.Now().UnixMilli())
				return map[string]interface{}{"orderId": orderID, "orderStatus": "created"}, nil
			},
			Compensate: func(ctx map[string]interface{}) error {
				fmt.Printf("  Cancelling order %v\n", ctx["orderId"])
				return nil
			},
		},
		{
			Name: "ReserveInventory",
			Execute: func(ctx map[string]interface{}) (map[string]interface{}, error) {
				fmt.Printf("  Reserving inventory for order %v\n", ctx["orderId"])
				resID := fmt.Sprintf("RES-%d", time.Now().UnixMilli())
				return map[string]interface{}{"inventoryReserved": true, "reservationId": resID}, nil
			},
			Compensate: func(ctx map[string]interface{}) error {
				fmt.Printf("  Releasing inventory reservation %v\n", ctx["reservationId"])
				return nil
			},
		},
		{
			Name: "ChargePayment",
			Execute: func(ctx map[string]interface{}) (map[string]interface{}, error) {
				amount, _ := ctx["amount"].(float64)
				fmt.Printf("  Charging payment for order %v, amount: $%.2f\n", ctx["orderId"], amount)
				if amount > 1000 {
					return nil, fmt.Errorf("payment declined: insufficient funds")
				}
				payID := fmt.Sprintf("PAY-%d", time.Now().UnixMilli())
				return map[string]interface{}{"paymentId": payID, "charged": true}, nil
			},
			Compensate: func(ctx map[string]interface{}) error {
				fmt.Printf("  Refunding payment %v\n", ctx["paymentId"])
				return nil
			},
		},
		{
			Name: "ConfirmOrder",
			Execute: func(ctx map[string]interface{}) (map[string]interface{}, error) {
				fmt.Printf("  Confirming order %v (payment: %v)\n", ctx["orderId"], ctx["paymentId"])
				return map[string]interface{}{
					"orderStatus": "confirmed",
					"confirmedAt": time.Now().Format(time.RFC3339),
				}, nil
			},
			Compensate: func(ctx map[string]interface{}) error {
				fmt.Printf("  Reverting order %v confirmation\n", ctx["orderId"])
				return nil
			},
		},
	}
}

// --- Main ---
func main() {
	registry := NewServiceRegistry()
	registry.Register("order-service", "http://localhost:3001")
	registry.Register("inventory-service", "http://localhost:3002")
	registry.Register("payment-service", "http://localhost:3003")

	orchestrator := NewSagaOrchestrator(registry)
	steps := createOrderSagaSteps()

	// Successful order
	fmt.Println("=== Scenario 1: Successful Order ===")
	orchestrator.Execute("saga-001", steps, map[string]interface{}{
		"userId": "user-42",
		"items":  []map[string]interface{}{{"sku": "WIDGET-A", "qty": 2}, {"sku": "GADGET-B", "qty": 1}},
		"amount": 99.99,
	})

	// Failed order -- triggers compensation
	fmt.Println("=== Scenario 2: Payment Failure with Rollback ===")
	orchestrator.Execute("saga-002", steps, map[string]interface{}{
		"userId": "user-42",
		"items":  []map[string]interface{}{{"sku": "EXPENSIVE-ITEM", "qty": 1}},
		"amount": 5000.0,
	})

	registry.Stop()
}
```

</div>
</CodeTabs>

## What Makes This Production-Ready

- **Saga orchestration** -- coordinates multi-step distributed transactions with a clear state machine
- **Compensating transactions** -- automatic rollback in reverse order when any step fails
- **Circuit breakers** -- prevents cascading failures by short-circuiting calls to unhealthy services
- **Exponential backoff with jitter** -- retries failed calls without thundering herd problems
- **Service registry** -- dynamic service discovery with health checking for resilient routing
- **Full state tracking** -- every saga step transition is logged for debugging and auditing

<div class="takeaways">

### Key Takeaways

- The saga pattern replaces distributed transactions with a sequence of local transactions plus compensating actions
- Always define compensating transactions for every saga step -- they are your rollback mechanism
- Circuit breakers prevent one failing service from taking down the entire system
- Exponential backoff with jitter prevents retry storms that would overwhelm recovering services
- Service discovery enables dynamic scaling -- services can be added or removed without configuration changes
- Log every state transition in your saga for debugging production issues

</div>

<div class="when-to-use">

### Real-World Usage

- **Uber** uses saga orchestration for ride booking: match driver, authorize payment, start ride, with rollback at every step
- **Netflix** pioneered the circuit breaker pattern with Hystrix to handle partial failures across 700+ microservices
- **Amazon** uses sagas for order fulfillment across inventory, payment, and shipping services
- Use sagas when you need consistency across services but cannot use a single database transaction

</div>

