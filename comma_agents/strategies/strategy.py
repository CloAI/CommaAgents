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
    def __init__(self, strategy_name: str, strategy_params: dict = {}):
        """
        Initialize the strategy with a name and parameters.

        Parameters:
        - strategy_name (str): The name of the strategy.
        - strategy_params (dict): Parameters for defining the strategy, if any.
        """
        # Initialize the parent class with the strategy name and an empty list of flows
        super().__init__(flow_name=strategy_name, flows=[])
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
            strategy_model = StrategyModel(**strategy_data)
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
