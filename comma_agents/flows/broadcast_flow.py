

from typing import List, Union
from comma_agents.agents import BaseAgent
from comma_agents.flows.base_flow import BaseFlow


class BroadcastFlow(BaseFlow):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
    
    def _run_flow(self, prompt: str = "") -> List[str]:
        """
        Runs the flow with the specified prompt.

        Parameters:
        prompt (str): The prompt to be used for the flow.

        Returns:
        List[str]: A list of responses from each agent in the flow.
        """
        responses = []
        for flow in self.flows:
            responses.append(flow.call(prompt) if isinstance(flow, BaseAgent) else flow.run_flow(prompt))
        
        return ",".join(responses) #TODO: make this configurable
