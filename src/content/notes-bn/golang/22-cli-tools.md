---
title: 'CLI Tool বানানো'
subtitle: 'Go-এর single-binary output একে CLI tool-এর জন্য পারফেক্ট করে তোলে — developer tool, automation script, আর DevOps utility বানান।'
chapter: 22
level: 'advanced'
readingTime: '18 মিনিট'
topics: ['CLI', 'cobra', 'flags', 'terminal', 'developer tools', 'automation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

রহিম স্টেশনে গিয়ে দেখে একটা বড় টিকিট ভেন্ডিং মেশিন দাঁড়িয়ে আছে। মেশিনটা একটা না, তিনটা কাজ করে — সামনে তিনটা বড় বাটন: "টিকিট কিনুন", "রিফান্ড", আর "কার্ড রিচার্জ"। রহিম আগে ঠিক করে সে কোন কাজটা করবে, তারপর সেই বাটনটা চাপে। কিনতে চাইলে "কিনুন" বাটন, টাকা ফেরত চাইলে "রিফান্ড" — একেকটা বাটন একেকটা আলাদা কাজের দরজা খুলে দেয়।

"কিনুন" চাপার পর মেশিন কিছু ছোট টগল দেখায় — এসি না নন-এসি, কয়টা টিকিট। এগুলো রহিম ইচ্ছেমতো সেট করে, না ছুঁলে মেশিন নিজের ডিফল্ট (একটা টিকিট, নন-এসি) ধরে নেয়। তারপর সে গন্তব্যের নাম টাইপ করে — "ঢাকা"। কোন বাটন কী করে বুঝতে না পারলে পাশের দেয়ালে একটা ছাপানো গাইড ঝোলানো আছে, রহিম সেটা পড়ে নেয়। টিকিট ঠিকঠাক বেরোলে মেশিনের মাথায় সবুজ বাতি জ্বলে, আর কিছু গড়বড় হলে — গন্তব্য ভুল বা টাকা কম — লাল বাতি জ্বলে ওঠে।

এই মেশিনটাই আসলে একটা CLI tool। তিনটা মূল বাটন হলো **subcommand** (`buy`, `refund`, `recharge`) — প্রতিটা আলাদা কাজ। এসি/নন-এসি বা সংখ্যার টগলগুলো হলো **flag** (যেমন `--class ac --count 2`), যেগুলোর ডিফল্ট মান থাকে। টাইপ করা গন্তব্য "ঢাকা" হলো **argument** — মূল ইনপুট যেটা কমান্ড কাজ করে। দেয়ালের ছাপানো গাইড হলো `--help`, আর সবুজ/লাল বাতি হলো **exit code** — 0 মানে সফল, non-zero মানে error। বাস্তবে `git` ঠিক এভাবেই বানানো — `git commit`, `git push` হলো subcommand, `-m "message"` হলো flag, ব্রাঞ্চের নাম argument, `git --help` গাইড, আর কমান্ড fail করলে non-zero exit code দেয় যেটা দিয়ে script বুঝতে পারে কিছু ভুল হয়েছে।

## CLI Tool-এর জন্য Go কেন

Docker, Kubernetes (kubectl), Terraform, Hugo, GitHub CLI — সবই Go-তে লেখা। কারণটা: **single binary, zero dependency**। একটা file ship করুন, Linux, macOS, Windows-এ কাজ করে।

<Callout type="info">

**বাস্তব উদাহরণ**

Go CLI tool হলো একটা সুইস আর্মি নাইফের মতো যেটা আপনি যেকোনো জায়গায় নিয়ে যেতে পারেন। Python script চালাতে Python install থাকা দরকার। Node script-এর Node দরকার। Java-র দরকার JVM। একটা Go binary যেকোনো মেশিনে কাজ করে — download, run, শেষ। কোনো `pip install` নেই, কোনো `npm install` নেই, কোনো runtime নেই।

</Callout>

## Standard Library দিয়ে সাধারণ CLI

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

## Cobra দিয়ে Production CLI

আসল CLI tool-এর জন্য Cobra ব্যবহার করুন — kubectl, Hugo, আর GitHub CLI-এর পেছনের framework:

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

## Progress Indicator

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

## Configuration File

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

যেকোনো platform থেকে যেকোনো platform-এর জন্য build করুন:

```bash
# Build for all platforms
GOOS=linux   GOARCH=amd64 go build -o dist/taskr-linux-amd64 .
GOOS=linux   GOARCH=arm64 go build -o dist/taskr-linux-arm64 .
GOOS=darwin  GOARCH=amd64 go build -o dist/taskr-darwin-amd64 .
GOOS=darwin  GOARCH=arm64 go build -o dist/taskr-darwin-arm64 .
GOOS=windows GOARCH=amd64 go build -o dist/taskr-windows-amd64.exe .
```

## Distribution-এর জন্য GoReleaser ব্যবহার

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
    name_template: '{{.ProjectName}}_{{.Os}}_{{.Arch}}'

brews:
  - repository:
      owner: yourname
      name: homebrew-tap
    homepage: 'https://github.com/yourname/taskr'
    description: 'A simple task manager'
```

```bash
goreleaser release --clean
```

## মূল কথা

1. **সাধারণ tool-এর জন্য `flag` দিয়ে শুরু করুন**, জটিল CLI-এর জন্য **Cobra**-তে যান
2. **Subcommand** কাজকে সাজিয়ে রাখে — `taskr add`, `taskr list`, `taskr done`
3. **`tabwriter`** সারিবদ্ধ table output-এর জন্য — standard library-তে built-in
4. **`GOOS` আর `GOARCH` দিয়ে Cross-compile করুন** — যেকোনো platform থেকে যেকোনো platform-এর জন্য build
5. **Viper** configuration-এর জন্য — YAML file, env var, আর default একটা package-এ
6. **GoReleaser** build, packaging, আর distribution (Homebrew tap সহ) automate করে
