---
title: "Building CLI Tools"
subtitle: "Go's single-binary output makes it perfect for CLI tools — build developer tools, automation scripts, and DevOps utilities."
chapter: 22
level: "advanced"
readingTime: "18 min"
topics: ["CLI", "cobra", "flags", "terminal", "developer tools", "automation"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Go for CLI Tools

Docker, Kubernetes (kubectl), Terraform, Hugo, GitHub CLI — all written in Go. The reason: **single binary, zero dependencies**. Ship one file, works on Linux, macOS, Windows.

<Callout type="info">

**Real-World Analogy**

Go CLI tools are like a Swiss Army knife you can carry anywhere. Python scripts need Python installed. Node scripts need Node. Java needs the JVM. A Go binary works on any machine — download, run, done. No `pip install`, no `npm install`, no runtime.

</Callout>

## Simple CLI with Standard Library

```go
package main

import (
    "flag"
    "fmt"
    "os"
)

func main() {
    // Define flags
    name := flag.String("name", "World", "Name to greet")
    count := flag.Int("count", 1, "Number of greetings")
    uppercase := flag.Bool("upper", false, "Print in uppercase")

    flag.Usage = func() {
        fmt.Fprintf(os.Stderr, "Usage: greet [options]\n\nOptions:\n")
        flag.PrintDefaults()
    }

    flag.Parse()

    for i := 0; i < *count; i++ {
        msg := fmt.Sprintf("Hello, %s!", *name)
        if *uppercase {
            msg = strings.ToUpper(msg)
        }
        fmt.Println(msg)
    }
}
```

```bash
go build -o greet .
./greet --name Fatima --count 3 --upper
# HELLO, FATIMA!
# HELLO, FATIMA!
# HELLO, FATIMA!
```

## Production CLI with Cobra

For real CLI tools, use Cobra — the framework behind kubectl, Hugo, and GitHub CLI:

```go
// cmd/root.go
package cmd

import (
    "fmt"
    "os"

    "github.com/spf13/cobra"
)

var (
    verbose bool
    cfgFile string
)

var rootCmd = &cobra.Command{
    Use:   "taskr",
    Short: "A simple task manager",
    Long:  "Taskr is a CLI task manager that helps you organize your work.",
}

func Execute() {
    if err := rootCmd.Execute(); err != nil {
        fmt.Fprintln(os.Stderr, err)
        os.Exit(1)
    }
}

func init() {
    rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "verbose output")
    rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default: ~/.taskr.yaml)")
}
```

```go
// cmd/add.go
package cmd

import (
    "fmt"
    "strings"

    "github.com/spf13/cobra"
)

var priority string

var addCmd = &cobra.Command{
    Use:   "add [task description]",
    Short: "Add a new task",
    Args:  cobra.MinimumNArgs(1),
    RunE: func(cmd *cobra.Command, args []string) error {
        description := strings.Join(args, " ")

        task, err := store.AddTask(description, priority)
        if err != nil {
            return fmt.Errorf("adding task: %w", err)
        }

        fmt.Printf("Added task #%d: %s [%s]\n", task.ID, task.Description, task.Priority)
        return nil
    },
}

func init() {
    addCmd.Flags().StringVarP(&priority, "priority", "p", "medium", "Priority (low, medium, high)")
    rootCmd.AddCommand(addCmd)
}
```

```go
// cmd/list.go
package cmd

import (
    "fmt"
    "os"
    "text/tabwriter"

    "github.com/spf13/cobra"
)

var showAll bool

var listCmd = &cobra.Command{
    Use:   "list",
    Short: "List tasks",
    Aliases: []string{"ls"},
    RunE: func(cmd *cobra.Command, args []string) error {
        tasks, err := store.ListTasks(showAll)
        if err != nil {
            return fmt.Errorf("listing tasks: %w", err)
        }

        if len(tasks) == 0 {
            fmt.Println("No tasks found.")
            return nil
        }

        w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
        fmt.Fprintln(w, "ID\tSTATUS\tPRIORITY\tDESCRIPTION")
        fmt.Fprintln(w, "--\t------\t--------\t-----------")

        for _, t := range tasks {
            status := "[ ]"
            if t.Done {
                status = "[x]"
            }
            fmt.Fprintf(w, "%d\t%s\t%s\t%s\n", t.ID, status, t.Priority, t.Description)
        }
        w.Flush()

        return nil
    },
}

func init() {
    listCmd.Flags().BoolVarP(&showAll, "all", "a", false, "Show completed tasks too")
    rootCmd.AddCommand(listCmd)
}
```

```bash
# Usage
taskr add "Write unit tests" --priority high
taskr add "Update README"
taskr list
# ID  STATUS  PRIORITY  DESCRIPTION
# --  ------  --------  -----------
# 1   [ ]     high      Write unit tests
# 2   [ ]     medium    Update README

taskr done 1
taskr list --all
```

## Interactive Input

```go
import "bufio"

func promptConfirm(message string) bool {
    reader := bufio.NewReader(os.Stdin)
    fmt.Printf("%s [y/N]: ", message)
    input, _ := reader.ReadString('\n')
    input = strings.TrimSpace(strings.ToLower(input))
    return input == "y" || input == "yes"
}

func promptInput(label string) string {
    reader := bufio.NewReader(os.Stdin)
    fmt.Printf("%s: ", label)
    input, _ := reader.ReadString('\n')
    return strings.TrimSpace(input)
}

// Usage
if promptConfirm("Delete all completed tasks?") {
    store.DeleteCompleted()
    fmt.Println("Done.")
}
```

## Progress Indicators

```go
func processFiles(files []string) {
    total := len(files)

    for i, file := range files {
        processFile(file)

        // Simple progress bar
        pct := float64(i+1) / float64(total) * 100
        bar := strings.Repeat("█", int(pct/5)) + strings.Repeat("░", 20-int(pct/5))
        fmt.Printf("\r[%s] %.0f%% (%d/%d)", bar, pct, i+1, total)
    }
    fmt.Println()  // New line after completion
}
```

## Configuration Files

```go
import "github.com/spf13/viper"

type Config struct {
    Database struct {
        Host     string `mapstructure:"host"`
        Port     int    `mapstructure:"port"`
        Name     string `mapstructure:"name"`
    } `mapstructure:"database"`
    LogLevel string `mapstructure:"log_level"`
}

func loadConfig() (*Config, error) {
    viper.SetConfigName(".taskr")
    viper.SetConfigType("yaml")
    viper.AddConfigPath("$HOME")
    viper.AddConfigPath(".")

    // Environment variable override
    viper.SetEnvPrefix("TASKR")
    viper.AutomaticEnv()

    // Defaults
    viper.SetDefault("log_level", "info")
    viper.SetDefault("database.host", "localhost")
    viper.SetDefault("database.port", 5432)

    if err := viper.ReadInConfig(); err != nil {
        if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
            return nil, fmt.Errorf("reading config: %w", err)
        }
    }

    var cfg Config
    if err := viper.Unmarshal(&cfg); err != nil {
        return nil, fmt.Errorf("unmarshaling config: %w", err)
    }

    return &cfg, nil
}
```

## Cross-Compilation

Build for any platform from any platform:

```bash
# Build for all platforms
GOOS=linux   GOARCH=amd64 go build -o dist/taskr-linux-amd64 .
GOOS=linux   GOARCH=arm64 go build -o dist/taskr-linux-arm64 .
GOOS=darwin  GOARCH=amd64 go build -o dist/taskr-darwin-amd64 .
GOOS=darwin  GOARCH=arm64 go build -o dist/taskr-darwin-arm64 .
GOOS=windows GOARCH=amd64 go build -o dist/taskr-windows-amd64.exe .
```

## Using GoReleaser for Distribution

```yaml
# .goreleaser.yaml
builds:
  - main: ./cmd/taskr
    binary: taskr
    goos: [linux, darwin, windows]
    goarch: [amd64, arm64]
    ldflags:
      - -s -w
      - -X main.version={{.Version}}
      - -X main.commit={{.Commit}}

archives:
  - format: tar.gz
    name_template: "{{.ProjectName}}_{{.Os}}_{{.Arch}}"

brews:
  - repository:
      owner: yourname
      name: homebrew-tap
    homepage: "https://github.com/yourname/taskr"
    description: "A simple task manager"
```

```bash
goreleaser release --clean
```

## Key Takeaways

1. **Start with `flag`** for simple tools, graduate to **Cobra** for complex CLIs
2. **Subcommands** organize functionality — `taskr add`, `taskr list`, `taskr done`
3. **`tabwriter`** for aligned table output — built into the standard library
4. **Cross-compile** with `GOOS` and `GOARCH` — build for any platform from any platform
5. **Viper** for configuration — YAML files, env vars, and defaults in one package
6. **GoReleaser** automates builds, packaging, and distribution including Homebrew taps

