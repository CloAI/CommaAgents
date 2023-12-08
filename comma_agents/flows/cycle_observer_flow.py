from .cycle_flow import CycleFlow
from ..agents.base_agent import BaseAgent

class CycleObserverFlow(CycleFlow):
    def __init__(self, flows=[], observer_agent=None, cycles=1, **kwargs):
        # Ensure that observer_agent is an instance of BaseAgent
        if not isinstance(observer_agent, BaseAgent):
            raise ValueError("observer_agent must be an instance of BaseAgent")
        super().__init__(flows=flows, cycles=cycles, **kwargs)
        self.observer_agent = observer_agent

        # Add the observer agent to the hooks for the cycle flow but make it the first priority
        self.hooks["alter_prompt_after_cycle"].insert(0, self.alter_prompt_after_cycle)

    def alter_prompt_after_cycle(self, prompt=""):
        # Run the observer agent on the prompt
        response = self.observer_agent.call(prompt)
        # Return the response to be used as the prompt for the cycle
        return response
