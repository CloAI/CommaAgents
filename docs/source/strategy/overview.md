# Strategy Framework Overview

The Strategy Framework is designed to facilitate the creation, management, and execution of complex workflows, referred to as "strategies," within the Comma Agents ecosystem. A strategy consists of a sequence of "flows," where each flow can perform a specific task or operation. Flows can be instances of `BaseFlow`, representing a sequence of operations, or `BaseAgent`, encapsulating individual agent behaviors.

Strategies are defined in YAML files, allowing for easy customization, sharing, and versioning. The framework provides tools to load these strategies dynamically, validate their structure, and execute them, leveraging Python's dynamic import capabilities to instantiate and configure flows and agents based on the YAML specifications.

## YAML Strategy Configuration Format

The YAML format for defining strategies is structured to specify the metadata and components of a strategy in a readable and hierarchical manner. Below is an overview of the key elements in a strategy configuration file:

```yaml
name: Example Strategy
description: A brief description of the example strategy.
author: Author Name
version: 1.0
strategy:
  - name: Flow One
    description: Description of the first flow.
    type: comma_agents.flows.SequentialFlow
    parameters:
      # Parameters specific to this flow
  - name: Flow Two
    description: Description of the second flow.
    type: comma_agents.agents.BaseAgent
    parameters:
      # Parameters specific to this agent
```

- `name`: The name of the strategy.
- `description`: A brief description of the strategy.
- `author`: The name of the author or creator of the strategy.
- `version`: The version of the strategy, which can be a string or a float.
- `strategy`: A list of flows that comprise the strategy. Each flow is defined with:
  - `name`: The name of the flow.
  - `description`: A brief description of the flow.
  - `type`: The fully qualified class name of the flow or agent.
  - `parameters`: A dictionary of parameters to configure the flow or agent.
  - `flows`: (Optional if type is a BaseFlow) A list of nested flows within the current flow. These can also be agents.

## CLI Command Overview

The `comma-agents-cli` provides a command-line interface to interact with the Strategy Framework, allowing users to load, validate, and execute strategies defined in YAML files.

### Strategy Run Command

The `strategy run` command is used to execute a strategy from a specified YAML file.

```
comma-agents-cli strategy run --file /path/to/strategy.yaml
```

- `--file`: Specifies the path to the YAML file containing the strategy definition.

This command loads the strategy defined in the given YAML file, validates its structure against the expected schema, dynamically imports and instantiates the flows and agents specified in the strategy, and then executes the strategy according to the defined sequence of flows.

## Exporting a Strategy Configuration to YAML

In the Strategy Framework, strategies can be programmatically exported to YAML files using a dedicated function. This function is designed to serialize and save the strategy configuration in a structured and readable YAML format.

### Export Function Overview

The `export_to_file` function allows users to save their strategy configurations to a file. This makes it possible to persist dynamically created or modified strategies, facilitating easy sharing and versioning.

### Example Code

Below is an example demonstrating how this functionality can be implemented within a `Strategy` class. The example includes a `StrategyTestModel` class, which is initialized with a specific strategy configuration. This strategy is then exported to a YAML file using the `export_to_file` function.

```python
from comma_agents.agents.user_agent import UserAgent
from comma_agents.flows.infinite_cycle_flow import InfiniteCycleFlow
from comma_agents.flows.sequential_flow import SequentialFlow
from comma_agents.hub.agents.cloai.mlx.agent import MLXAgent # For MacOS MLX devices
from comma_agents.strategies.strategy import Strategy

class StrategyTestModel(Strategy):
    def __init__(self, strategy_params: dict = {}):
        super().__init__("Test Strategy Model", strategy_params, [
            SequentialFlow(flow_name="Flow 1", flows=[
                UserAgent(require_input=True),
                MLXAgent("MLX Llama Agent", config={
                    "model_path": "mlx-community/TinyLlama-1.1B-Chat-v1.0-4bit",
                    "max_tokens": 256,
                    "seed": 42,
                    "temp": 0.5,
                }),
                InfiniteCycleFlow(flows=[
                    MLXAgent("MLX Llama Agent", again_config={
                        "model_path": "mlx-community/TinyLlama-1.1B-Chat-v1.0-4bit",
                        "max_tokens": 256,
                        "seed": 42,
                        "temp": 0.5,
                    }),
                ])
            ]),
        ])

test_strategy = StrategyTestModel()
test_strategy.export_to_file("test_strategy.yaml")
```

### Usage

To use this functionality, instantiate the strategy model and call `export_to_file` with the desired file path. This function serializes the current strategy configuration and saves it to the specified YAML file.

# Summary

The Strategy Framework in Comma Agents provides a powerful mechanism to define and execute complex workflows through a combination of modular flows and agents. The YAML strategy configuration format offers a flexible and user-friendly way to specify strategies, while the `comma-agents-cli` tool enables easy management and execution of strategies from the command line. This combination of features supports the creation of versatile and dynamic agent-based applications.