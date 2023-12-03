class BaseAgent:
    def __init__(self, model_name, keep_historical_context=False, **hooks):
        self.model_name = model_name
        self.keep_historical_context = keep_historical_context
        self.historical_context = ""
        # Set default hooks if not provided in kwargs
        self.hooks = {
            "before_initial_call": hooks.get("before_initial_call", []),
            "alter_initial_prompt": hooks.get("alter_initial_prompt", []),
            "after_initial_call": hooks.get("after_initial_call", []),
            "before_call": hooks.get("before_call", []),
            "alter_call_prompt": hooks.get("alter_call_prompt", []),
            "after_call": hooks.get("after_call", [])
        }

    def initial_call(self, *args, **kwargs):
        args, kwargs = self._execute_alter_hooks("alter_initial_prompt", *args, **kwargs)
        self._execute_hooks("before_initial_call", *args, **kwargs)
        response = self._call_llm(*args, **kwargs)
        self._execute_hooks("after_initial_call", response)
        if self.keep_historical_context:
            self.historical_context += " ".join(args) + " "
        return response

    def call(self, *args, **kwargs):
        if self.keep_historical_context:
            args = (self.historical_context + " ".join(args),) + args
        args, kwargs = self._execute_alter_hooks("alter_call_prompt", *args, **kwargs)
        self._execute_hooks("before_call", *args, **kwargs)
        response = self._call_llm(*args, **kwargs)
        self._execute_hooks("after_call", response)
        if self.keep_historical_context:
            self.historical_context += " ".join(args) + " "
        return response

    def _call_llm(self, *args, **kwargs):
        # Placeholder for LLM interaction
        return f"Calling {self.model_name} LLM with arguments {args} and keyword arguments {kwargs}"

    def _execute_hooks(self, hook_name, *args, **kwargs):
        for hook in self.hooks.get(hook_name, []):
            hook(*args, **kwargs)

    def _execute_alter_hooks(self, hook_name, *args, **kwargs):
        for hook in self.hooks.get(hook_name, []):
            args, kwargs = hook(*args, **kwargs)
        return args, kwargs

