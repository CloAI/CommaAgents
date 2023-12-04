from typing import Callable, Dict, List, Optional, Any, TypedDict
from ..agents.base_agent import BaseAgent

class BaseFlow:
    def __init__(self, agents: List[BaseAgent], verbose_level: int = 0):
        # Ensure that agents is a list of BaseAgent instances
        if not all(isinstance(agent, BaseAgent) for agent in agents):
            raise ValueError("All elements in agents must be instances of BaseAgent")
        self.agents = agents
        
        if verbose_level > 0:
            for agent in self.agents:
                agent.verbose_level = verbose_level

    def run_flow(self, *args, **kwargs):
        responses = []
        for agent in self.agents:
            response = agent.initial_call(*args, **kwargs)  # Assuming initial call for each agent in the flow
            responses.append(response)
        return responses
