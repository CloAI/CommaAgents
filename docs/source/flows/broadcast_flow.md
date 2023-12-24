# BroadcastFlow: Broadcast a Message Across Agents

## Overview 🌐
`BroadcastFlow` 🌟, a derivative of `BaseFlow`, is uniquely designed to orchestrate the simultaneous execution of multiple agents or flows. It excels in distributing a single input message 📨 across various content processors and then weaving their individual responses into a unified narrative.

## Key Concepts 🗝️
- **Simultaneous Execution**: Unlike its parent `BaseFlow` which navigates a message through a sequential path, `BroadcastFlow` adopts a broadcasting approach 📡, sending the same message to all agents or flows in unison.
- **Aggregated Responses**: It skillfully collates the diverse responses 💬 from each element, presenting a composite output that encapsulates multiple viewpoints.

## Initialization 🏁
The constructor of `BroadcastFlow` 🏗️ seamlessly integrates with the `BaseFlow` setup, without adding new parameters:
- `**kwargs`: Inherits all the flexible keyword arguments from `BaseFlow`, ensuring a familiar initialization process.

## Methods 🛠️
### `_run_flow`
The heartbeat 💓 of `BroadcastFlow` where the broadcast magic happens:
- **Input**: A shared message 🔄 sent to every flow or agent within the `BroadcastFlow`.
- **Output**: The responses are ingeniously compiled into a list of strings, typically joined by commas. This method hints at future customization possibilities for response aggregation.

## Code Example 💻
```python
from comma_agents.flows import BroadcastFlow
from comma_agents.agents import BaseAgent

# EchoAgent: A simple agent that echoes received messages
class EchoAgent(BaseAgent):
    def call(self, message):
        return f"Echo: {message}"

# Instantiating EchoAgents
agent1 = EchoAgent(name="Echo1")
agent2 = EchoAgent(name="Echo2")

# Crafting a BroadcastFlow with EchoAgents
broadcast_flow = BroadcastFlow(flows=[agent1, agent2])

# Broadcasting a message to receive collective responses
responses = broadcast_flow.run_flow(message="Hello there")
```
In this illustrative scenario, `responses` encapsulates the concatenated echoes from `agent1` and `agent2`, showcasing `BroadcastFlow`'s ability to create a harmonized output from multiple inputs. 🎼🗣️