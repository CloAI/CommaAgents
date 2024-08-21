import importlib
import yaml
import sys
from typing import List, Union
from pydantic import BaseModel, ValidationError
from comma_agents.flows.sequential_flow import SequentialFlow
from comma_agents.flows import BaseFlow

# Define a Pydantic model for the flow within a strategy
class StrategyFlow(BaseModel):
    name: str  # The name of the flow
    description: str  # A brief description of what the flow does
    type: str  # The fully qualified class name of the flow
    parameters: dict  # Parameters to initialize the flow

# Define a Pydantic model for the entire strategy
class StrategyModel(BaseModel):
    name: str  # The name of the strategy
    description: str  # A brief description of the strategy
    author: str  # The author of the strategy
    version: Union[str, float]  # The version of the strategy
    strategy: List[StrategyFlow]  # A list of flows that comprise the strategy

# Define the Strategy class, extending SequentialFlow
class Strategy(SequentialFlow):
    def __init__(self, strategy_name: str, strategy_params: dict = {}, flows: List[BaseFlow] = []):
        """
        Initialize the strategy with a name and parameters.

        Parameters:
        - strategy_name (str): The name of the strategy.
        - strategy_params (dict): Parameters for defining the strategy, if any.
        """
        # Initialize the parent class with the strategy name and an empty list of flows
        super().__init__(flow_name=strategy_name, flows=flows)
        self.strategy_params = strategy_params  # Store strategy parameters

    def load_from_file(self, file_path: str):
        """
        Loads a strategy configuration from a YAML file.

        Parameters:
        - file_path (str): The path to the YAML file containing the strategy configuration.
        """
        with open(file_path, 'r') as file:
            strategy_data = yaml.safe_load(file)
        
        try:
            # Validate the strategy data against the Pydantic model
            StrategyModel(**strategy_data)
        except ValidationError as e:
            print("Validation error:", e.json())
            raise
        
        # Parse the individual flows in the strategy
        if 'strategy' in strategy_data:
            self.name = strategy_data.get('name', 'Unnamed Strategy')
            strategy_flows = strategy_data['strategy']
            self.flows = self._parse_flows(strategy_flows)

    def _parse_flows(self, flows_data) -> List[BaseFlow]:
        """
        Parses flow data into flow instances.

        Parameters:
        - flows_data (list): A list of dictionaries, each describing a flow.

        Returns:
        List[BaseFlow]: A list of instantiated flow objects.
        """
        parsed_flows = []
        for flow_data in flows_data:
            # Dynamically import and instantiate the flow or agent class
            flow_or_agent_instance = dynamic_import_and_instantiate(
                flow_data.get('type'), **flow_data.get('parameters', {}))
            
            parsed_flows.append(flow_or_agent_instance)

        return parsed_flows

    def _serialize_flow(self, flow):
        """
        Recursively serialize a flow and its subflows to a dictionary format suitable for YAML output.

        Parameters:
        flow (BaseFlow or BaseAgent): The flow to serialize.

        Returns:
        dict: A dictionary representation of the flow and its subflows.
        """
        # Handle different types of flow objects
        if hasattr(flow, 'flow_name'):
            flow_name = flow.flow_name
        elif hasattr(flow, 'name'):
            flow_name = flow.name
        else:
            flow_name = 'Unnamed Flow'

        flow_data = {
            'name': flow_name,
            'description': getattr(flow, 'description', 'No description provided'),
            'type': f"{flow.__module__}.{flow.__class__.__name__}",
            # Get parameters but filter out objects that are not serializable
            'parameters': {k: v for k, v in getattr(flow, 'parameters', {}).items() if is_jsonable(v)}
        }

        if 'flow_name' in flow_data['parameters']:
            del flow_data['parameters']['flow_name']

        flow_data['parameters']['name'] = flow_name
        # Check if the flow has subflows and serialize them
        if hasattr(flow, 'flows') and flow.flows:
            flow_data['parameters']['flows'] = [self._serialize_flow(subflow) for subflow in flow.flows]

        return flow_data

    def export_to_file(self, file_path: str):
        """
        Exports the current strategy configuration to a YAML file.

        Parameters:
        file_path (str): The file path where the strategy configuration will be saved.
        """
        strategy_data = {
            'name': self.flow_name,
            'description': 'Exported strategy configuration',
            'author': 'Export function',
            'version': '1.0',
            'strategy': []
        }

        # Serialize each flow in the strategy
        for flow in self.flows:
            flow_data = self._serialize_flow(flow)
            strategy_data['strategy'].append(flow_data)

        # Write the dictionary to a YAML file
        try:
            with open(file_path, 'w') as file:
                strategy_yaml = yaml.dump(strategy_data, default_flow_style=False, sort_keys=False)
                file.write(strategy_yaml)
                file.close()
            print(f"Strategy exported successfully to {file_path}")
        except IOError as e:
            print(f"An error occurred while writing to the file: {e}")


def dynamic_import_and_instantiate(class_path: str, **params):
    """
    Dynamically imports and instantiates a class based on its path.

    Parameters:
    - class_path (str): The fully qualified class path.
    - **params: Additional parameters to pass to the class constructor.

    Returns:
    An instance of the specified class.
    """
    # Support for nested flows
    if 'flows' in params:
        nested_flows_data = params.pop('flows')
        params['flows'] = [
            dynamic_import_and_instantiate(flow['type'], **flow.get('parameters', {}))
            for flow in nested_flows_data
        ]
    
    module_path, class_name = class_path.rsplit('.', 1)
    module = importlib.import_module(module_path)  # Dynamically import the module
    cls = getattr(module, class_name)  # Get the class from the module
    instance = cls(**params)  # Instantiate the class with the provided parameters
    return instance

import json

def is_jsonable(x):
    try:
        json.dumps(x)
        return True
    except (TypeError, OverflowError):
        return False