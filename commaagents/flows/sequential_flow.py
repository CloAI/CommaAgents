from .base_flow import BaseFlow

class SequentialFlow(BaseFlow):
    def run_flow(self, *args, **kwargs):
        previous_response = None
        first_call = True

        for agent in self.agents:
            if first_call:
                # For the first call of each agent, use the original args and kwargs
                response = agent.initial_call(*args, **kwargs)
                first_call = False
            else:
                # For subsequent calls, use the response of the previous agent as the new input
                response = agent.call(previous_response)

            previous_response = response

        return response

