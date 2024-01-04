# InfiniteCycleFlow: Keep Going Forever

## Overview

`InfiniteCycleFlow`, an innovative extension of the `CycleFlow` from the `comma_agents` framework, is engineered for perpetual execution of a sequence of agents or flows. 

### Key Concept 🌟

This class smartly adapts the `_run_flow` functionality from `CycleFlow`, omitting the traditional loop termination, to craft an unending cycle of flow execution.

## Initialization Parameters 🛠️

`InfiniteCycleFlow` aligns with `CycleFlow` in terms of initialization parameters, but it uniquely emphasizes continuous execution by defaulting the `cycles` parameter to 1.

- `flows`: Accepts either a collection or a single instance of `BaseAgent` or `BaseFlow` for ceaseless execution.
- `hooks`: Embraces cycle-specific hooks from `CycleFlow`, plus any additional hooks from subclasses.
- `**kwargs`: Opens the door for further customization via additional configuration arguments inherited from `BaseFlow`.

## Method Highlights 📌

### `_run_flow`

`InfiniteCycleFlow` transforms this method into an eternal loop, endlessly iterating over the specified flows. This loop is designed to perpetuate without a conventional end.

- **Input**: Optionally starts with an initial message.
- **Output**: Reflects the continuous results from the ongoing cycle iterations.

## Code Example 💻

```python
from comma_agents.flows import InfiniteCycleFlow
from comma_agents.agents import BaseAgent

# Crafting a simple, repetitive agent for demonstration
class RepetitiveAgent(BaseAgent):
    def call(self, message):
        print(message)
        return message

# Setting up InfiniteCycleFlow with a repetitive agent
infinite_flow = InfiniteCycleFlow(flows=[RepetitiveAgent(name="Repeater")])

# Initiating the infinite flow
# Caution: This will generate an unending output in an infinite loop.
# Ensure to have an exit strategy or interrupt mechanism.
infinite_flow.run_flow(message="Echo forever")
```

In this example, triggering the `run_flow` method sets the `RepetitiveAgent` on a never-ending journey of echoing "Echo forever".

---

**Note**: This example serves educational purposes, showcasing limitless execution. Practical use should consider specific constraints, like termination conditions or interrupts, to manage the infinite nature of the flow.