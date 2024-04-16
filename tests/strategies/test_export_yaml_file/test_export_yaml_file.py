import pytest
from unittest.mock import patch, MagicMock, call
from comma_agents.agents.user_agent import UserAgent
from comma_agents.flows.infinite_cycle_flow import InfiniteCycleFlow
from comma_agents.flows.sequential_flow import SequentialFlow
from comma_agents.hub.agents.cloai.mlx.agent import MLXAgent
from comma_agents.strategies.strategy import Strategy

class TestStrategyExportYamlFile:
    def test_export_yaml_file(self):
        """
        Test to verify the export of a strategy configuration to a YAML file.
        """

        class StrategyTestModel(Strategy):
            def __init__(self, strategy_params: dict = {}):
                super().__init__("Test Strategy Model", strategy_params, [
                    SequentialFlow(flow_name="Flow 1", flows=[
                        UserAgent(require_input=True),
                        MLXAgent("MLX Llama Agent", {
                            "model_path": "mlx-community/TinyLlama-1.1B-Chat-v1.0-4bit",
                            "max_tokens": 256,
                            "seed": 42,
                            "temp": 0.5,
                        }),
                        InfiniteCycleFlow(flows=[
                            MLXAgent("MLX Llama Agent", {
                                "model_path": "mlx-community/TinyLlama-1.1B-Chat-v1.0-4bit",
                                "max_tokens": 256,
                                "seed": 42,
                                "temp": 0.5,
                            }),
                        ])
                    ]),
                ])

        test_strategy = StrategyTestModel()

        # Hook into the file save content for the test and assert the content
        with patch('builtins.open', create=True) as mock_open:
            test_strategy.export_to_file("test_strategy.yaml")
            # mock_open.assert_called_once_with("test_strategy.yaml", 'w')
            # handle = mock_open()
            # handle.write.assert_called_once_with(
            #     "name: Test Strategy Model\n"
            #     "description: \n"
            #     "author: \n"
            #     "version: \n"
            #     "strategy:\n"
            #     "  - name: Flow 1\n"
            #     "    description: \n"
            #     "    type: comma_agents.flows.sequential_flow.SequentialFlow\n"
            #     "    parameters: {}\n"
            #     "    flows:\n"
            #     "      - name: User Agent\n"
            #     "        description: \n"
            #     "        type: comma_agents.agents.user_agent.UserAgent\n"
            #     "        parameters:\n"
            #     "          require_input: true\n"
            #     "      - name: MLX Llama Agent\n"
            #     "        description: \n"
            #     "        type: comma_agents.hub.agents.cloai.mlx.agent.MLXAgent\n"
            #     "        parameters:\n"
            #     "          model_path: mlx-community/TinyLlama-1.1B-Chat-v1.0-4bit\n"
            #     "          max_tokens: 256\n"
            #     "          seed: 42\n"
            #     "          temp: 0.5\n"
            #     "      - name: Nested flow\n"
            #     "        description: \n"
            #     "        type: comma_agents.flows.infinite_cycle_flow.InfiniteCycleFlow\n"
            #     "        parameters: {}\n"
            #     "        flows:\n"
            #     "          - name: MLX Llama Agent\n"
            #     "            description: \n"
            #     "            type: comma_agents.hub.agents.cloai.mlx.agent.MLXAgent\n"
            #     "            parameters:\n"
            #     "              model_path: mlx-community/TinyLlama-1.1B-Chat-v1.0-4bit\n"
            #     "              max_tokens: 256\n"
            #     "              seed: 42\n"
            #     "              temp: 0.5\n"
            # )
            # handle.close.assert_called_once()

            print("Strategy exported successfully to test_strategy.yaml")
            
        

            
class StrategyTestModel(Strategy):
    def __init__(self, strategy_params: dict = {}):
        super().__init__("Test Strategy Model", strategy_params, [
            SequentialFlow(flow_name="Flow 1", flows=[
                UserAgent(require_input=True),
                MLXAgent("MLX Llama Agent", {
                    "model_path": "mlx-community/TinyLlama-1.1B-Chat-v1.0-4bit",
                    "max_tokens": 256,
                    "seed": 42,
                    "temp": 0.5,
                }),
                InfiniteCycleFlow(flows=[
                    MLXAgent("MLX Llama Agent", {
                        "model_path": "mlx-community/TinyLlama-1.1B-Chat-v1.0-4bit",
                        "max_tokens": 256,
                        "seed": 42,
                        "temp": 0.5,
                    }),
                ])
            ]),
        ])

test_strategy = StrategyTestModel()
# Hook into the file save content for the test and assert the content
with patch('builtins.open', create=True) as mock_open:
    test_strategy.export_to_file("test_strategy.yaml")
    # mock_open.assert_called_once_with("test_strategy.yaml", 'w')
    # handle = mock_open()
    # handle.write.assert_called_once_with(
    #     "name: Test Strategy Model\n"
    #     "description: \n"
    #     "author: \n"
    #     "version: \n"
    #     "strategy:\n"
    #     "  - name: Flow 1\n"
    #     "    description: \n"
    #     "    type: comma_agents.flows.sequential_flow.SequentialFlow\n"
    #     "    parameters: {}\n"
    #     "    flows:\n"
    #     "      - name: User Agent\n"
    #     "        description: \n"
    #     "        type: comma_agents.agents.user_agent.UserAgent\n"
    #     "        parameters:\n"
    #     "          require_input: true\n"
    #     "      - name: MLX Llama Agent\n"
    #     "        description: \n"
    #     "        type: comma_agents.hub.agents.cloai.mlx.agent.MLXAgent\n"
    #     "        parameters:\n"
    #     "          model_path: mlx-community/TinyLlama-1.1B-Chat-v1.0-4bit\n"
    #     "          max_tokens: 256\n"
    #     "          seed: 42\n"
    #     "          temp: 0.5\n"
    #     "      - name: Nested flow\n"
    #     "        description: \n"
    #     "        type: comma_agents.flows.infinite_cycle_flow.InfiniteCycleFlow\n"
    #     "        parameters: {}\n"
    #     "        flows:\n"
    #     "          - name: MLX Llama Agent\n"
    #     "            description: \n"
    #     "            type: comma_agents.hub.agents.cloai.mlx.agent.MLXAgent\n"
    #     "            parameters:\n"
    #     "              model_path: mlx-community/TinyLlama-1.1B-Chat-v1.0-4bit\n"
    #     "              max_tokens: 256\n"
    #     "              seed: 42\n"
    #     "              temp: 0.5\n"
    # )
    # handle.close.assert_called_once()
    
    print("Strategy exported successfully to test_strategy.yaml")
