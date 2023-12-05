from typing import List, Union
from comma_agents.agents.base_agent import BaseAgent
from .base_flow import BaseFlow

class SequentialFlow(BaseFlow):
    def __init__(self, flows: Union[List[Union[BaseAgent, BaseFlow]], BaseAgent, BaseFlow], verbose_level: int = 1):
        super().__init__(flows, verbose_level)

    def _run_flow(self, prompt=None):
        previous_response = prompt
        for flow in self.flows:
            # Check if the element is an agent or another flow
            if isinstance(flow, BaseAgent):
                response = flow.call(previous_response)
            elif isinstance(flow, BaseFlow):
                response = flow.run_flow(previous_response)
            else:
                raise TypeError("Unsupported flow type")

            previous_response = response  # Update the prompt for the next agent/flow

        return response
