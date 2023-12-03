from ..agents.base_agent import BaseAgent

class BaseFlow:
    def __init__(self, agents):
        # Ensure that agents is a list of BaseAgent instances
        if not all(isinstance(agent, BaseAgent) for agent in agents):
            raise ValueError("All elements in agents must be instances of BaseAgent")
        self.agents = agents

    def run_flow(self, *args, **kwargs):
        responses = []
        for agent in self.agents:
            response = agent.initial_call(*args, **kwargs)  # Assuming initial call for each agent in the flow
            responses.append(response)
        return responses
