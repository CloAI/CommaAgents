from typing import List
from comma_agents.agents.base_agent import BaseAgent
from .base_flow import BaseFlow

class SequentialFlow(BaseFlow):
    def __init__(self, agents: List[BaseAgent], verbose_level: int = 1):
        super().__init__(agents, verbose_level)
        self.first_call = True
    
    def run_flow(self, *args, **kwargs):
        previous_response = None

        if self.first_call:
            for agent in self.agents:
                # For the first call of each agent, use the original args and kwargs
                response = agent.initial_call(previous_response)
                previous_response = response
            
            self.first_call = False
        else:
            for agent in self.agents:
                # For subsequent calls, use the response of the previous agent as the new input
                response = agent.call(previous_response)

                previous_response = response

        return response

