

from typing import List, Union
from comma_agents.agents import BaseAgent
from comma_agents.flows.base_flow import BaseFlow


class BroadcastFlow(BaseFlow):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
    
    def _run_flow(self, message: str = "") -> List[str]:
        """
        Runs the flow with the specified message.

        Parameters:
        message (str): The message to be used for the flow.

        Returns:
        List[str]: A list of responses from each agent in the flow.
        """
        responses = []
        for flow in self.flows:
            responses.append(flow.call(message) if isinstance(flow, BaseAgent) else flow.run_flow(message))
        
        return ",".join(responses) #TODO: make this configurable for concatenation or list of responses
