import os
from typing import Callable, Dict, List, Optional, Any, TypedDict

from colorama import Fore, Style
from comma_agents.code_interpreters.code_interpreter import CodeInterpreter
from comma_agents.utils.misc import or_one_value_to_array

def print_agent_prompt_format(
    agent_name: str,
    prompt: str = None,
    response: str = None,
    system_prompt: bool = None,
    use_unicode: bool = True
) -> str:
    """
    Prints a formatted output for an agent's prompt and response in the console, 
    using distinct emojis and colors for different components of the interaction.

    This function is designed to enhance the readability of agent interactions by visually 
    differentiating between the agent name, system prompt, user prompt, and agent response.

    Parameters
    ----------
    agent_name : str
        The name of the agent.
    prompt : str, optional
        The user's prompt or input. Default is None.
    response : str, optional
        The agent's response to the prompt. Default is None.
    system_prompt : bool, optional
        A system-generated prompt or message, if applicable. Default is None.
    use_unicode : bool, optional
        Flag to indicate whether Unicode characters (emojis) should be used. Default is True.

    Notes
    -----
    - The function uses different emojis to represent the agent, system prompt, user prompt, 
      and agent response for clear visual distinction.
    - Colors are also applied for further differentiation: Cyan for the agent name, Blue for the system prompt, 
      Yellow for the user prompt, and Green for the agent response.
    - This function assumes that the terminal supports color output via the `colorama` module.

    Examples
    --------
    >>> print_agent_prompt_format(
    ...     "ExampleBot",
    ...     prompt="What's the weather like?",
    ...     response="It's sunny.",
    ...     use_unicode=True
    ... )
    # Output will include formatted texts with emojis and colors for the agent name, user prompt, and agent response.
    """

    robot_emoji = '\U0001F916' if use_unicode else '[:robot:]'
    settings_emoji = '\U0001F4DD' if use_unicode else '[:gear:]'
    thought_balloon_emoji = '\U0001F4AD' if use_unicode else '[:thought_balloon:]'
    brain_emoji = '\U0001F9E0' if use_unicode else '[:brain:]'
    
    # Get the width of the terminal
    width = os.get_terminal_size().columns

    # Print the separator
    print("#" * width)
    print(robot_emoji + Fore.CYAN + "Agent Name: " + agent_name + Style.RESET_ALL)

    if system_prompt is not None:
        # Print the prompt in blue
        print(settings_emoji + Fore.BLUE + "System Prompt: " + system_prompt + Style.RESET_ALL)

    # Print the prompt in yellow
    print(thought_balloon_emoji + Fore.YELLOW + "Prompt: " + prompt + Style.RESET_ALL)

    # Print the response in green
    print(brain_emoji + Fore.GREEN + "Response: " + response + Style.RESET_ALL)

    # Print the separator again
    print("#" * width)

class BaseAgent:
    """
    BaseAgent is a foundational class designed for interactions with a Large Language Model (Agent). It facilitates 
    the management of conversation flow, including the formatting of prompts, handling historical context, executing 
    custom hooks at various interaction stages, and managing verbose output for detailed logging.

    The class is structured to be highly customizable through attributes such as hooks for different stages of 
    interaction, formats for messages, and levels of verbosity. This design makes BaseAgent adaptable for a wide 
    range of applications that involve conversational AI or Agents.

    Attributes
    ----------
    name : str
        The name of the agent, primarily used for identification and logging.
    system_prompt : Optional[str]
        An initial system prompt or message used to start conversations.
    hooks : BaseAgent.AgentHooks
        A set of user-defined functions executed at specific stages of the Agent interaction.
    remember_context : bool
        A flag to determine whether the agent should maintain a history of interactions.
    context_window_size : Optional[int]
        The maximum number of past interactions to retain in history, if historical context is enabled.
    prompt_formats : BaseAgent.AgentPromptFormats
        Formatting specifications for various types of messages.
    verbose_level : int
        The level of detail for the agent's output logging.
    verbose_formats : BaseAgent.AgentVerboseFormats
        Formatting options for the agent's verbose outputs.

    Methods
    -------
    initial_call(prompt)
        Initiates the first interaction with the Agent, applying necessary hooks and formatting.
    call(prompt)
        Manages subsequent interactions with the Agent, incorporating historical context as needed.
    _call_llm(prompt)
        Placeholder for the actual Agent interaction, intended to be overridden in subclasses.
    _execute_hooks(hook_name, *args, **kwargs)
        Executes a set of predefined hooks based on the specified hook name.
    _execute_alter_hooks(hook_name, prompt)
        Modifies the given prompt using specified 'alter' hooks.
    _update_historical_context(prompt, response)
        Adds the recent interaction to the agent's historical context and manages the history size.

    Examples
    --------
    >>> agent = BaseAgent(name="ExampleAgent", remember_context=True, verbose_level=2)
    >>> response = agent.call("What is the capital of France?")
    >>> print(response)
    'Calling ExampleAgent Agent with prompt What is the capital of France?'
    """
    class AgentHooks(TypedDict, total=False):
        """
        AgentHooks is a TypedDict utilized in the BaseAgent class to define a set of hooks that can be invoked at 
        various stages of an interaction with a Large Language Model (Agent). These hooks are optional and offer a way 
        to introduce custom behavior or modify data at specific points in the Agent interaction cycle.

        Each key in this TypedDict represents a distinct stage in the Agent call process, and its value is a callable 
        function. These functions provide the flexibility to perform pre-processing, post-processing, or data 
        alteration during different phases of interaction with the Agent.

        Attributes
        ----------
        before_initial_call : Optional[Callable[..., Any]]
            A function to be executed before the first Agent call. It can be used to set up necessary conditions 
            or perform preliminary data processing.
        alter_initial_prompt : Optional[Callable[..., Any]]
            A function to modify the initial prompt sent to the Agent. This allows alteration or augmentation of 
            the prompt based on dynamic conditions or contextual needs.
        after_initial_call : Optional[Callable[..., Any]]
            A function to be executed immediately after the first Agent call. Useful for processing the Agent's 
            response, performing cleanup tasks, or implementing logging mechanisms.
        before_call : Optional[Callable[..., Any]]
            Similar to 'before_initial_call', but executed before each subsequent Agent call. It offers an 
            opportunity to adjust or prepare data prior to each interaction with the Agent.
        alter_call_prompt : Optional[Callable[..., Any]]
            A function to modify the prompt for subsequent Agent calls, enabling dynamic changes based on prior 
            interactions or external inputs.
        after_call : Optional[Callable[..., Any]]
            Executed after each Agent call, this function can be used for processing the responses, logging, 
            or conducting post-call cleanup activities.

        These hooks provide a versatile framework to enhance and tailor the functionality of the BaseAgent, 
        making it adaptable to various scenarios and use cases in Agent-based applications.

        Examples
        --------
        >>> def custom_pre_call():
        ...     print("Pre-call hook executed")
        >>> agent_hooks = AgentHooks(before_call=custom_pre_call)
        >>> agent = BaseAgent(name="ExampleAgent", hooks=agent_hooks)
        """
        before_initial_call: Optional[Callable[..., Any]]
        alter_initial_prompt: Optional[Callable[..., Any]]
        after_initial_call: Optional[Callable[..., Any]]
        before_call: Optional[Callable[..., Any]]
        alter_call_prompt: Optional[Callable[..., Any]]
        after_call: Optional[Callable[..., Any]]

    class AgentPromptFormats(TypedDict, total=False):
        """
        AgentPromptFormats is a custom TypedDict used in the BaseAgent class to define the formatting of prompts 
        at various stages of interaction with a Large Language Model (Agent). This dictionary specifies format tokens 
        for different segments of a prompt, providing a structured way to delineate system messages, user messages, 
        and assistant messages.

        By defining these format tokens, the BaseAgent can construct prompts that are clearly segmented, aiding 
        in the clarity and context management of the Agent's operations.

        Attributes
        ----------
        system_message_start_token : str
            The token used to indicate the start of a system message. This helps in identifying messages that originate 
            from the system itself.
        system_message_end_token : str
            The token used to indicate the end of a system message.
        user_message_start_token : str
            The token used to indicate the start of a user message. It differentiates the user's input from other parts 
            of the prompt.
        user_message_end_token : str
            The token used to indicate the end of a user message.
        assistant_message_start_token : str
            The token used to indicate the start of an assistant's message. This is particularly useful for responses 
            generated by the Agent.
        assistant_message_end_token : str
            The token used to indicate the end of an assistant's message.

        These format tokens are integral in constructing and parsing the prompts and responses in a conversation 
        with an Agent, ensuring clear and contextually relevant interactions.

        Examples
        --------
        >>> prompt_formats = AgentPromptFormats(
        ...     system_message_start_token="<sys>",
        ...     system_message_end_token="</sys>",
        ...     user_message_start_token="<user>",
        ...     user_message_end_token="</user>",
        ...     assistant_message_start_token="<assistant>",
        ...     assistant_message_end_token="</assistant>"
        ... )
        >>> agent = BaseAgent(name="ExampleAgent", prompt_formats=prompt_formats)
        """
        system_message_start_token: str
        system_message_end_token: str
        user_message_start_token: str
        user_message_end_token: str
        assistant_message_start_token: str
        assistant_message_end_token: str
    
    class AgentVerboseFormats(TypedDict, total=False):
        """
        AgentVerboseFormats is a custom TypedDict utilized in the BaseAgent class to define formatting functions 
        for verbose outputs during the agent's operation. This dictionary acts as a configuration tool, allowing 
        the user to specify custom formatting for different types of output messages.

        The dictionary's structure provides flexibility and ease in customizing verbose outputs, which is particularly 
        beneficial for enhancing the readability and clarity of operation logs or console outputs in debugging or 
        monitoring scenarios.

        Attributes
        ----------
        print_agent_prompt_format : Optional[Callable[[str, Optional[str], Optional[str], Optional[bool], bool], None]]
            A callable function designated to format the agent's prompts and responses. It takes multiple parameters:
            - agent_name (str): The name of the agent generating the output.
            - prompt (Optional[str]): The input or query given to the agent.
            - response (Optional[str]): The output or response generated by the agent.
            - is_system_prompt (Optional[bool]): Flag indicating if the message is a system-generated prompt.
            - use_unicode (bool): Flag indicating whether to use Unicode characters in the formatting.
            The function is expected to return None, focusing solely on the task of formatting and displaying/logging 
            the prompts and responses.

        Examples
        --------
        >>> verbose_formats = AgentVerboseFormats(print_agent_prompt_format=my_custom_format_function)
        >>> agent = BaseAgent(name="ExampleAgent", verbose_formats=verbose_formats)
        """
        print_agent_prompt_format: Optional[Callable[[str, Optional[str], Optional[str], Optional[bool], bool], None]]

    class AgentLLMFunctionalCallbacksParams(TypedDict, total=True):
        name: str
        description: str
        type: str
        
    class AgentLLMFunctionalCallbacksReturnValue(TypedDict, total=True):
        type: str
        description: str
    class AgentLLMFunctionalCallbacks(TypedDict, total=False):
        """"""
        function_name: str
        function_description: str
        function: Callable[..., Any]
        params: List["BaseAgent.AgentLLMFunctionalCallbacksParams"]
        return_value: List["BaseAgent.AgentLLMFunctionalCallbacksReturnValue"]
    
    def __init__(
        self,
        name: str,
        system_prompt: Optional[str] = "",
        hooks: "BaseAgent.AgentHooks" = {},
        remember_context: bool = False,
        context_window_size: Optional[int] = None,
        prompt_formats: "BaseAgent.AgentPromptFormats" = {},
        interpret_code: bool = False,
        code_interpreter: Optional["CodeInterpreter"] = None,
        verbose_level: int = 1,
        verbose_formats: "BaseAgent.AgentVerboseFormats" = {},
        llm_functional_callbacks: "BaseAgent.AgentLLMFunctionalCallbacks" = {}
    ) -> None:
        """
        Initializes an instance of the BaseAgent class.

        This constructor sets up the initial configuration of the agent, including its name, system prompts, hooks,
        context management settings, prompt formats, verbosity level, and verbose formats.

        Parameters
        ----------
        name : str
            The name of the agent, used for identification purposes.
        system_prompt : Optional[str], optional
            The initial system prompt or message to be used, by default an empty string.
        hooks : BaseAgent.AgentHooks, optional
            A set of user-defined functions (hooks) for different stages of the agent's operation, by default an empty dict.
        remember_context : bool, optional
            Whether to retain a history of previous interactions for context, by default False.
        context_window_size : Optional[int], optional
            The number of past interactions to consider for context, by default None (all history is used).
        prompt_formats : BaseAgent.AgentPromptFormats, optional
            Format settings for various types of messages with start and end tokens, by default with empty tokens.
        verbose_level : int, optional
            The level of verbose output the agent provides, ranging from 0 (no output) to 3 (maximum detail), by default 1.
        verbose_formats : BaseAgent.AgentVerboseFormats, optional
            Formatting options for verbose output, by default an empty dict.

        Notes
        -----
        - The `hooks` parameter allows customization of the agent's behavior at various stages, such as before or after 
        an agent call, or for altering prompts.
        - The `prompt_formats` parameter is used to define how different types of messages (system, user, assistant) 
        are formatted.
        - The verbosity level (`verbose_level`) controls the amount of detail in the agent's output, useful for 
        debugging or monitoring purposes.

        Examples
        --------
        >>> agent = BaseAgent(
        ...     name="ExampleAgent",
        ...     verbose_level=2,
        ...     remember_context=True,
        ...     context_window_size=5
        ... )
        """
        # Initializing attributes with provided values or default to empty values
        self.name = name
        self.system_prompt = system_prompt
        self.verbose_level = verbose_level

        # Initializing historical context list if enabled
        self.remember_context = remember_context
        self.context_window_size = context_window_size
        self.historical_context = []

        # Flag to indicate if this is the first call to the Agent
        self.first_call = True
        self.interpret_code = interpret_code
        self.code_interpreter = code_interpreter
        self.llm_functional_callbacks = llm_functional_callbacks
        
        if self.interpret_code is True and code_interpreter is None:
            raise ValueError(f"You must provide a code interpreter if you want to interpret code for {self.name}.")

        # Initializing hooks with provided values or default to empty lists
        self.hooks: "BaseAgent.AgentHooks" = {
            "before_initial_call": or_one_value_to_array(hooks.get("before_initial_call")),
            "alter_initial_prompt": or_one_value_to_array(hooks.get("alter_initial_prompt")),
            "after_initial_call": or_one_value_to_array(hooks.get("after_initial_call")),
            "before_call": or_one_value_to_array(hooks.get("before_call")),
            "alter_call_prompt": or_one_value_to_array(hooks.get("alter_call_prompt")),
            "after_call": or_one_value_to_array(hooks.get("after_call"))
        }
        
        # Initializing prompt formats with provided values or default to empty strings
        self.prompt_formats: "BaseAgent.AgentPromptFormats" = {
            "system_message_start_token": prompt_formats.get("system_message_start_token", ""),
            "system_message_end_token": prompt_formats.get("system_message_end_token", ""),
            "user_message_start_token": prompt_formats.get("user_message_start_token", ""),
            "user_message_end_token": prompt_formats.get("user_message_end_token", ""),
            "assistant_message_start_token": prompt_formats.get("assistant_message_start_token", ""),
            "assistant_message_end_token": prompt_formats.get("assistant_message_end_token", "")
        }

        # Initializing verbose formats with provided values or default to the print_agent_prompt_format function
        self.verbose_formats: "BaseAgent.AgentVerboseFormats" = {
            "print_agent_prompt_format": verbose_formats.get("print_agent_prompt_format", print_agent_prompt_format)
        }

    def initial_call(self, prompt: str) -> str:
        """
        Executes the initial interaction with the Agent, applying hooks and formatting to the provided prompt.

        This method is responsible for initiating the conversation with the Agent and is crucial for setting up 
        the context of the interaction. It applies any defined hooks and formatting to the initial prompt before 
        sending it to the Agent.

        Parameters
        ----------
        prompt : str
            The initial input or query for the Agent.

        Returns
        -------
        str
            The Agent's response to the initial query.

        Notes
        -----
        - This method handles the first interaction with the Agent. It is different from subsequent calls as it 
        sets the context for the conversation.
        - Hooks for altering the initial prompt (`alter_initial_prompt`), pre-call processing (`before_initial_call`), 
        and post-call processing (`after_initial_call`) are applied here.
        - The method also handles the addition of system and user message tokens to the prompt, based on the configuration 
        in `prompt_formats`.

        Examples
        --------
        >>> agent = BaseAgent(name="ExampleAgent")
        >>> response = agent.initial_call("How's the weather today?")
        """
        # Modify the initial prompt using 'alter_initial_prompt' hooks, if any
        prompt = self._execute_alter_hooks("alter_initial_prompt", prompt)

        # Execute hooks that are set to run before the initial agent call
        self._execute_hooks("before_initial_call")

        # Construct the full prompt with designated formatting tokens and the initial system prompt
        full_prompt = self.prompt_formats["system_message_start_token"] + self.system_prompt + \
                    self.prompt_formats["system_message_end_token"] + self.prompt_formats["user_message_start_token"] + \
                    prompt + self.prompt_formats["user_message_end_token"] + \
                    self.prompt_formats["assistant_message_start_token"]

        # Perform the actual call to the agent with the prepared prompt
        response = self._call_llm(prompt=full_prompt)

        # If code interpretation is enabled, interpret the code and append the output to the response
        if self.interpret_code is True:
            response = response + "\nCode Output: " + self.code_interpreter.interpret_code(response)
            
        # If verbose logging is enabled, format and display/log the prompt and response interaction
        if self.verbose_level >= 1:
            self.verbose_formats["print_agent_prompt_format"](self.name, prompt, response, self.system_prompt)

        # Execute hooks that are set to run after the initial agent call, passing the response
        self._execute_hooks("after_initial_call", response)

        # If keeping historical context is enabled, update it with the current prompt and response
        if self.remember_context:
            self._update_historical_context(prompt, response)

        # Return the response received from the agent
        return response

    def call(self, prompt: str) -> str:
        """
        Makes a subsequent call to the Large Language Model (Agent), incorporating historical context if enabled. 
        This method is used for all calls to the Agent after the initial one.

        Parameters
        ----------
        prompt : str
            The input or query provided to the Agent for this call.

        Returns
        -------
        str
            The response from the Agent based on the processed prompt.

        Notes
        -----
        - If this is the first call, `initial_call` method is invoked instead.
        - The method modifies the prompt using 'alter_call_prompt' hooks, if any.
        - Executes 'before_call' hooks before making the call to the Agent.
        - Constructs the full prompt with historical context and formatting tokens.
        - Makes the actual call to the Agent and processes the response.
        - Executes 'after_call' hooks and updates the historical context with the new interaction.

        Examples
        --------
        >>> agent = BaseAgent(name="ExampleAgent")
        >>> response = agent.call("What is the weather like today?")
        """
        if self.first_call:
            self.first_call = False
            return self.initial_call(prompt)

        prompt = self._execute_alter_hooks("alter_call_prompt", prompt)

        # Execute 'before' hooks
        self._execute_hooks("before_call")

        if self.verbose_level >= 2:
            print(f"Calling {self.name} Agent with prompt {prompt}")
        # Actual call to the Agent
        
        full_prompt = self.prompt_formats["system_message_start_token"] + self.system_prompt + self.prompt_formats["system_message_end_token"]
        
        if self.remember_context:
            for (historical_prompt, historical_response) in self.historical_context:

                full_prompt += self.prompt_formats["user_message_start_token"] + historical_prompt + self.prompt_formats["user_message_end_token"]
                full_prompt += self.prompt_formats["assistant_message_start_token"] + historical_response + self.prompt_formats["assistant_message_end_token"]
            
            full_prompt += self.prompt_formats["user_message_start_token"] + prompt + self.prompt_formats["user_message_end_token"]
        

        response = self._call_llm(prompt=full_prompt + self.prompt_formats["assistant_message_start_token"])

        # TODO: Allow the better prompt base system to format this code output better...2
        # If code interpretation is enabled, interpret the code and append the output to the response
        if self.interpret_code is True:
            response = response + "\nCode Output: " + self.code_interpreter.interpret_code(response)
        
        if self.verbose_level >= 1:
            self.verbose_formats["print_agent_prompt_format"](self.name, prompt, response, self.system_prompt)

        # Execute 'after' hooks
        self._execute_hooks("after_call", response)

        # Update historical context with response
        if self.remember_context:
            if self.verbose_level >= 3:
                print(f"Updating historical context with prompt {prompt} and response {response}")
            self._update_historical_context(prompt, response)

        return response
    
    def _call_llm(self, prompt: str='') -> str:
        """
        Placeholder method for the actual Large Language Model (Agent) interaction. 
        This method is intended to be overridden in subclasses to implement the specific Agent calling mechanism.

        Parameters
        ----------
        prompt : str, optional
            The input or query provided to the Agent for this call. Default is an empty string.

        Returns
        -------
        str
            A mock response string indicating the details of the call. In an actual implementation, this method 
            should return the response from the Agent.

        Notes
        -----
        - This method serves as a template and should be overridden in a subclass that connects to an actual Agent.
        - In its current form, it returns a string that mimics the response format, showing the provided prompt.
        
        Examples
        --------
        >>> agent = BaseAgent(name="ExampleAgent")
        >>> response = agent._call_llm("Sample prompt")
        'Calling ExampleAgent Agent with prompt Sample prompt'
        """
        # Placeholder implementation, to be overridden
        return f"Calling {self.name} Agent with prompt {prompt}"

    def _execute_hooks(self, hook_name: str, *args, **kwargs) -> None:
        """
        Executes a set of predefined hooks corresponding to a specific hook stage.

        Parameters
        ----------
        hook_name : str
            The name of the hook stage to execute. This identifies which group of hooks to run.
        *args
            Variable length argument list, representing the arguments to be passed to the hooks.
        **kwargs
            Arbitrary keyword arguments, representing additional information to be passed to the hooks.

        Notes
        -----
        - The method looks up the hook list associated with the given `hook_name` and executes each hook in sequence.
        - The hooks are functions or methods that have been added to the `self.hooks` dictionary under the specified `hook_name`.
        - Verbose output is controlled based on the `verbose_level` attribute of the class:
        - At level 3, it prints detailed information about the hook execution, including the arguments and keyword arguments.
        - At level 2, it only announces the execution of a hook stage without detailed arguments.

        Examples
        --------
        Assuming a hook named 'before_call' is defined in `self.hooks`:

        >>> agent = BaseAgent(name="ExampleAgent", verbose_level=3)
        >>> agent._execute_hooks('before_call', arg1, kwarg1='value')
        Executing hooks for before_call with args (arg1,) and kwargs {'kwarg1': 'value'}
        """
        if self.verbose_level >= 3:
            print(f"Executing hooks for {hook_name} with args {args} and kwargs {kwargs}")
        elif self.verbose_level == 2:
            print(f"Executing hooks for {hook_name}")

        for hook in self.hooks.get(hook_name, []):
            hook(*args, **kwargs)

    def _execute_alter_hooks(self, hook_name: str, prompt: str) -> str:
        """
        Executes 'alter' hooks associated with the given hook_name to potentially modify the prompt.

        This method iterates through all the hooks registered under the specified hook_name. Each hook is a function 
        that takes the current prompt as an argument and returns a modified version of it. The method applies these 
        modifications sequentially, allowing for cumulative changes to the prompt.

        Parameters
        ----------
        hook_name : str
            The name of the 'alter' hook stage to execute. This identifies the specific group of hooks to be applied.
        prompt : str
            The current prompt text that may be modified by the hooks.

        Returns
        -------
        str
            The modified prompt after all applicable 'alter' hooks have been executed.

        Examples
        --------
        >>> def add_greeting_to_prompt(prompt):
        ...     return "Hello! " + prompt
        >>> agent = BaseAgent(name="ExampleAgent", hooks={"alter_call_prompt": [add_greeting_to_prompt]})
        >>> modified_prompt = agent._execute_alter_hooks("alter_call_prompt", "What is the weather like?")
        >>> print(modified_prompt)
        Hello! What is the weather like?
        """
        for hook in self.hooks.get(hook_name, []):
            prompt = hook(prompt)
        return prompt
    
    def _update_historical_context(self, prompt: str, response: str) -> None:
        """
        Appends the given prompt and response pair to the agent's historical context.

        This method is used to maintain a record of the interactions (prompts and responses) between the agent 
        and the Agent. It appends the prompt and response as a tuple to the historical context list. If a context 
        window size is set, this method also ensures that the history is trimmed to maintain only the most recent 
        interactions as specified by the window size.

        Parameters
        ----------
        prompt : str
            The prompt that was sent to the Agent.
        response : str
            The response generated by the Agent.

        Notes
        -----
        - The historical context is used to maintain a continuity in conversations, which can be crucial for 
        applications requiring context-aware responses.
        - If the `context_window_size` is set, this method will ensure that the number of stored interactions 
        does not exceed this limit, removing the oldest entries as needed.

        Examples
        --------
        >>> agent = BaseAgent(name="ExampleAgent", remember_context=True, context_window_size=3)
        >>> agent._update_historical_context("How's the weather?", "It's sunny.")
        >>> agent._update_historical_context("What about tomorrow?", "Partly cloudy.")
        >>> print(agent.historical_context)
        [("How's the weather?", "It's sunny."), ("What about tomorrow?", "Partly cloudy.")]
        """
        self.historical_context.append((prompt, response))

        # Check if history context window size is set and enforce the limit
        if self.context_window_size is not None:
            while len(self.historical_context) > self.context_window_size:
                self.historical_context.pop(0)  # Remove the oldest entry
                
    
