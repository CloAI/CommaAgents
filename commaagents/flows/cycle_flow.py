class CycleFlow:
    def __init__(self, flow, cycles=1):
        # Ensure that flow is an instance of BaseFlow or its subclasses
        if not isinstance(flow, BaseFlow):
            raise ValueError("flow must be an instance of BaseFlow or its subclasses")
        self.flow = flow
        self.cycles = cycles

    def run_flow(self, *args, **kwargs):
        response = None
        for _ in range(self.cycles):
            response = self.flow.run_flow(*args, **kwargs)
            # Update args for the next cycle to use the latest response
            args = (response,)
        return response

