from .cycle_flow import CycleFlow
from ..agents.base_agent import BaseAgent

class CycleObserverFlow(CycleFlow):
    def __init__(self, flow, observer_agent, cycles=1):
        # Ensure that observer_agent is an instance of BaseAgent
        if not isinstance(observer_agent, BaseAgent):
            raise ValueError("observer_agent must be an instance of BaseAgent")
        super().__init__(flow, cycles)
        self.observer_agent = observer_agent

    def run_flow(self, *args, **kwargs):
        response = None
        for _ in range(self.cycles):
            response = self.flow.run_flow(*args, **kwargs)
            # Feed the output of the cycle to the observer agent
            observer_response = self.observer_agent.call(response)
            # Update args for the next cycle to use the observer's response
            args = (observer_response,)
        return response, observer_response
