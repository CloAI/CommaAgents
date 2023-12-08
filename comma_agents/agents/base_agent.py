from typing import Callable, Dict, List, Optional, Any, TypedDict
from comma_agents.utils.formats.clis.agent_verbose_formats import print_agent_prompt_format

class BaseAgent:
    class AgentVerboseFormats(TypedDict, total=False):
        """
        A custom type for defining verbose formats used in the BaseAgent class. This TypedDict specifies the allowed
        formats and their corresponding types. Each key is a stage in the LLM call process where
        verbose formats can be applied.

        Attributes:
            
        """
        print_agent_prompt_format: Optional[Callable[[str, Optional[str], Optional[str], Optional[bool], bool], None]]

    class AgentHooks(TypedDict, total=False):
        """
        A custom type for defining hooks used in the BaseAgent class. This TypedDict specifies the allowed
        hooks and their corresponding callable types. Each key is a stage in the LLM call process where
        hooks can be applied.

        Attributes:
            before_initial_call (Optional[Callable[..., Any]]): Function to execute before the first LLM call.
            alter_initial_prompt (Optional[Callable[..., Any]]): Function to modify the initial prompt.
            after_initial_call (Optional[Callable[..., Any]]): Function to execute after the first LLM call.
            before_call (Optional[Callable[..., Any]]): Function to execute before each subsequent LLM call.
            alter_call_prompt (Optional[Callable[..., Any]]): Function to modify the prompt for subsequent calls.
            after_call (Optional[Callable[..., Any]]): Function to execute after each subsequent LLM call.
        """
        before_initial_call: Optional[Callable[..., Any]]
        alter_initial_prompt: Optional[Callable[..., Any]]
        after_initial_call: Optional[Callable[..., Any]]
        before_call: Optional[Callable[..., Any]]
        alter_call_prompt: Optional[Callable[..., Any]]
        after_call: Optional[Callable[..., Any]]

    class AgentPromptFormats(TypedDict, total=False):
        """
        A custom type for defining prompt formats used in the BaseAgent class. This TypedDict specifies the allowed
        formats and their corresponding types. Each key is a stage in the LLM call process where
        prompt formats can be applied.

        Attributes:
            initial_prompt_format (Optional[str]): Format string for the initial prompt.
            subsequent_prompt_format (Optional[str]): Format string for subsequent prompts.
        """
        system_message_start_token: str
        system_message_end_token: str
        user_message_start_token: str
        user_message_end_token: str
        assistant_message_start_token: str
        assistant_message_end_token: str

    def __init__(
        self,
        name: str,
        system_prompt: Optional[str] = "",
        keep_historical_context: bool = False,
        verbose_level: int = 1,
        hooks: "BaseAgent.AgentHooks" = {},
        verbose_formats: "BaseAgent.AgentVerboseFormats" = {},
        history_context_window_size: Optional[int] = None,
        prompt_formats: "BaseAgent.AgentPromptFormats" = {
            "system_message_start_token": "",
            "system_message_end_token": "",
            "user_message_start_token": "",
            "user_message_end_token": "",
            "assistant_message_start_token": "",
            "assistant_message_end_token": "",
        }
    ):
        """
        Initializes a BaseAgent instance.

        :param model_name: Name of the model to interact with.
        :param keep_historical_context: Flag to keep historical context across calls.
        :param hooks: A dictionary of optional hooks for various stages of the LLM call process.
            - before_initial_call: Function to execute before the first LLM call.
            - alter_initial_prompt: Function to modify the initial prompt.
            - after_initial_call: Function to execute after the first LLM call.
            - before_call: Function to execute before each subsequent LLM call.
            - alter_call_prompt: Function to modify the prompt for subsequent calls.
            - after_call: Function to execute after each subsequent LLM call.
        :param verbose_level: Level of verbosity (0-3).
            - 0: No verbose output.
            - 1: Outputs only model prompts and responses.
            - 2: Outputs model prompts, responses, and hook call outputs.
            - 3: Outputs all details, including hook calls and arguments, and context appending.
        """
        self.name = name
        self.system_prompt = system_prompt
        self.verbose_level = verbose_level
        self.keep_historical_context = keep_historical_context
        self.historical_context = []
        self.first_call = True
        self.prompt_formats: "BaseAgent.AgentPromptFormats" = prompt_formats


        # Normalize hooks: convert single functions to lists or default to an empty list
        def normalize_hook(hook: Optional[Callable[..., Any]]) -> List[Callable[..., Any]]:
            """
            Normalizes the hook input, ensuring it is in list format.

            :param hook: A single callable or a list of callables.
            :return: A list of callables.
            """
            return hook if isinstance(hook, list) else [hook] if hook is not None else []

        # Initializing hooks with provided values or default to empty lists
        self.hooks: Dict[str, List[Callable[..., Any]]] = {
            "before_initial_call": normalize_hook(hooks.get("before_initial_call")),
            "alter_initial_prompt": normalize_hook(hooks.get("alter_initial_prompt")),
            "after_initial_call": normalize_hook(hooks.get("after_initial_call")),
            "before_call": normalize_hook(hooks.get("before_call")),
            "alter_call_prompt": normalize_hook(hooks.get("alter_call_prompt")),
            "after_call": normalize_hook(hooks.get("after_call"))
        }
        
        self.verbose_formats: "BaseAgent.AgentVerboseFormats" = {
            "print_agent_prompt_format": verbose_formats.get("print_agent_prompt_format", print_agent_prompt_format)
        }
        self.history_context_window_size = history_context_window_size

    def initial_call(self, prompt, *args, **kwargs):
        """
        Makes the initial call to the LLM, executing relevant hooks.

        :param args: Arguments for the LLM call.
        :param kwargs: Keyword arguments for the LLM call.
        :return: Response from the LLM.
        """
        prompt = self._execute_alter_hooks("alter_initial_prompt", prompt)

        # Execute 'before' hooks
        self._execute_hooks("before_initial_call", *args, **kwargs)

        full_prompt = self.prompt_formats["system_message_start_token"] + self.system_prompt + self.prompt_formats["system_message_end_token"] + self.prompt_formats["user_message_start_token"] + prompt + self.prompt_formats["user_message_end_token"] + self.prompt_formats["assistant_message_start_token"]

        # Actual call to the LLM
        response = self._call_llm(prompt=full_prompt, **kwargs)
        
        if self.verbose_level >= 1:
            self.verbose_formats["print_agent_prompt_format"](self.name, prompt, response, self.system_prompt)

        # Execute 'after' hooks
        self._execute_hooks("after_initial_call", response)

        # Update historical context with response
        if self.keep_historical_context:
            self._update_historical_context(prompt, response)

        return response

    def call(self, prompt, *args, **kwargs):
        """
        Makes a subsequent call to the LLM, including historical context if enabled.

        :param args: Arguments for the LLM call.
        :param kwargs: Keyword arguments for the LLM call.
        :return: Response from the LLM.
        """
        if self.first_call:
            self.first_call = False
            return self.initial_call(prompt, *args, **kwargs)

        prompt = self._execute_alter_hooks("alter_call_prompt", prompt)

        # Execute 'before' hooks
        self._execute_hooks("before_call", *args, **kwargs)

        if self.verbose_level >= 2:
            print(f"Calling {self.name} LLM with prompt {prompt}, arguments {args} and keyword arguments {kwargs}")
        # Actual call to the LLM
        
        full_prompt = self.prompt_formats["system_message_start_token"] + self.system_prompt + self.prompt_formats["system_message_end_token"]
        
        if self.keep_historical_context:
            for (historical_prompt, historical_response) in self.historical_context:

                full_prompt += self.prompt_formats["user_message_start_token"] + historical_prompt + self.prompt_formats["user_message_end_token"]
                full_prompt += self.prompt_formats["assistant_message_start_token"] + historical_response + self.prompt_formats["assistant_message_end_token"]
            
            full_prompt += self.prompt_formats["user_message_start_token"] + prompt + self.prompt_formats["user_message_end_token"]
        
        print("\nFull prompt being sent to LLM: " + full_prompt + self.prompt_formats["assistant_message_start_token"] + "\n")

        response = self._call_llm(prompt=full_prompt + self.prompt_formats["assistant_message_start_token"], **kwargs)
        
        if self.verbose_level >= 1:
            self.verbose_formats["print_agent_prompt_format"](self.name, prompt, response, self.system_prompt)

        # Execute 'after' hooks
        self._execute_hooks("after_call", response)

        # Update historical context with response
        if self.keep_historical_context:
            if self.verbose_level >= 3:
                print(f"Updating historical context with prompt {prompt} and response {response}")
            self._update_historical_context(prompt, response)

        return response
    
    def _call_llm(self, prompt='', *args, **kwargs):
        """
        Placeholder method for actual LLM interaction.

        :param args: Arguments for the LLM call.
        :param kwargs: Keyword arguments for the LLM call.
        :return: Mock response indicating the call details.
        """
        # This method should be overridden to make an actual call to a language learning model.
        return f"Calling {self.name} LLM with prompt {prompt}, arguments {args} and keyword arguments {kwargs}"

    # Updated method to include verbosity
    def _execute_hooks(self, hook_name, *args, **kwargs):
        """
        Executes a set of hooks based on the provided hook name.

        :param hook_name: The name of the hook stage to execute.
        :param args: Arguments for the hook.
        :param kwargs: Keyword arguments for the hook.
        """
        if self.verbose_level >= 3:
            print(f"Executing hooks for {hook_name} with args {args} and kwargs {kwargs}")
        elif self.verbose_level == 2:
            print(f"Executing hooks for {hook_name}")

        for hook in self.hooks.get(hook_name, []):
            hook(*args, **kwargs)

    def _execute_alter_hooks(self, hook_name: str, prompt: str) -> str:
        """
        Executes 'alter' hooks that can modify the prompt.

        :param hook_name: The name of the 'alter' hook stage to execute.
        :param prompt: The current prompt to be possibly modified by the hooks.
        :return: The modified prompt.
        """
        for hook in self.hooks.get(hook_name, []):
            prompt = hook(prompt)
        return prompt
    
    def _update_historical_context(self, prompt: str, response: str):
        """
        Appends the given prompt and response as a tuple to the historical context.

        :param prompt: The prompt that was sent to the LLM.
        :param response: The response generated by the LLM.
        """
        self.historical_context.append((prompt, response))

        # Check if history context window size is set and enforce the limit
        if self.history_context_window_size is not None:
            while len(self.historical_context) > self.history_context_window_size:
                self.historical_context.pop(0)  # Remove the oldest entry