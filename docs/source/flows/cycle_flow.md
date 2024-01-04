# CycleFlow: Cycle and Loop Through Conversations

## Overview
`CycleFlow` 🎡, part of the `comma_agents` package, is an innovative extension of the `BaseFlow` class. It orchestrates the execution of a collection of `flows` or `agents`, cycling through them a specific number of times, defined as `cycles`.

## Parameters 🛠️
- `flows`: Can be a single `BaseFlow`, `BaseAgent`, or a mixed list of both, set to execute in a cyclical order. By default, it starts with an empty list.
- `cycles`: This integer specifies how many rounds the `flows` should run. It's set to `1` by default.
- `hooks`: Utilizes `CycleFlow.CycleFlowHooks` for custom hooks at various stages of the cycle, enhancing flexibility and control. It's an empty dictionary initially.
- `**kwargs`: Supports arbitrary keyword arguments for added customization, passed to the `BaseFlow` constructor.

## Attributes 📝
- `cycles`: Dictates the cycle count for the flow execution.
- `hooks`: Details the special hooks used during different stages of the cycle.

## Methods 📌
### `_run_flow`
This method takes an optional `message` and runs the defined `flows` repeatedly as per the set cycles. It's the core of the cyclical operation, integrating cycle-specific hooks for nuanced control.

## Subclasses 🎓
### `CycleFlowHooks`
Derived from `BaseFlow.FlowHooks`, this subclass introduces cycle-specific hooks for `CycleFlow`:

#### Attributes
- `alter_message_before_cycle`: Modifies the message before each cycle begins.
- `alter_message_after_cycle`: Alters the message after each cycle concludes.

## Code Example 💻
Here's how you set up `CycleFlow` with two `BaseAgent` instances, configured for two cycles:

```python
from comma_agents.agents.base_agent import BaseAgent
from comma_agents.flows.cycle_flow import CycleFlow

# Creating BaseAgent instances
agent1 = BaseAgent(name="Agent1")
agent2 = BaseAgent(name="Agent2")

# Setting up CycleFlow for 2 cycles with the agents
cycle_flow = CycleFlow(flows=[agent1, agent2], cycles=2)

# Executing the cycle with an initial message
response = cycle_flow.run_flow(message="Start")
```
This setup assumes `BaseAgent` is capable of processing messages as required.
