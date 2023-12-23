import os
from typing import Callable, Dict, List, Optional, Any, TypedDict, Union

from colorama import Fore, Style
from comma_agents.code_interpreters.code_interpreter import CodeInterpreter
from comma_agents.prompts import PromptTemplate
from comma_agents.utils.misc import or_one_value_to_array

def print_agent_prompt_format(
    agent_name: str,
    message: str = None,
    system_message: str = None,
    response: str = None,
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

    if system_message is not None and system_message != "":
        # Print the prompt in blue
        print(settings_emoji + Fore.BLUE + "System Prompt: " + system_message + Style.RESET_ALL)

    # Print the prompt in yellow
    print(thought_balloon_emoji + Fore.YELLOW + "Prompt: " + message + Style.RESET_ALL)

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
        alter_call_message : Optional[Callable[..., Any]]
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
        before_initial_call: Optional[List[Callable[..., Any]]]
        alter_initial_call_message: Optional[List[Callable[..., Any]]]
        alter_initial_response: Optional[List[Callable[..., Any]]]
        after_initial_call: Optional[List[Callable[..., Any]]]
        before_call: Optional[List[Callable[..., Any]]]
        alter_call_message: Optional[List[Callable[..., Any]]]
        alter_response: Optional[List[Callable[..., Any]]]
        after_call: Optional[List[Callable[..., Any]]]

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
        print_agent_prompt_format: Optional[Callable[[str, Optional[PromptTemplate], Optional[str], Optional[bool], bool], None]]

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
        prompt_template: PromptTemplate = PromptTemplate(
            format="{system_message}\n{user_message}\n{assistant_message}\n",
        ),
        hooks: "BaseAgent.AgentHooks" = {},
        interpret_code: bool = False,
        code_interpreter: Optional["CodeInterpreter"] = None,
        verbose_level: int = 1,
        verbose_formats: Optional["BaseAgent.AgentVerboseFormats"] = None,
        # llm_functional_callbacks: "BaseAgent.AgentLLMFunctionalCallbacks" = {} TODO: This will provide some way to have functional callbacks... Might move it to the coder interpreter... still designing in mind
    ) -> None:
        """
        Initializes an instance of the BaseAgent class.

        This constructor sets up the initial configuration of the agent, including its name, prompt template, hooks, 
        code interpretation settings, verbosity level, and verbose formats.

        Parameters
        ----------
        name : str
            The name of the agent, used for identification purposes.
        prompt_template : PromptTemplate, optional
            The template for formatting prompts, by default a basic template with system, user, and assistant messages.
        hooks : BaseAgent.AgentHooks, optional
            A set of user-defined functions (hooks) for different stages of the agent's operation, by default an empty dict.
        interpret_code : bool, optional
            Flag indicating whether to interpret code segments in the inputs, by default False.
        code_interpreter : Optional[CodeInterpreter], optional
            The code interpreter to be used if code interpretation is enabled, by default None.
        verbose_level : int, optional
            The level of verbose output the agent provides, ranging from 0 (no output) to higher levels for more detail, by default 1.
        verbose_formats : Optional[BaseAgent.AgentVerboseFormats], optional
            Formatting options for verbose output, by default None.

        Notes
        -----
        - The `hooks` parameter allows customization of the agent's behavior at various stages.
        - The `prompt_template` defines the format for prompts including system, user, and assistant messages.
        - The `interpret_code` and `code_interpreter` are used to handle code segments in the inputs, if enabled.
        - The verbosity level (`verbose_level`) and formats (`verbose_formats`) control the detail and presentation of the agent's output.

        Raises
        ------
        ValueError
            If `interpret_code` is True but no `code_interpreter` is provided.

        Examples
        --------
        >>> agent = BaseAgent(
        ...     name="ExampleAgent",
        ...     verbose_level=2,
        ...     prompt_template=PromptTemplate(format="{user_message}\n{assistant_message}\n"),
        ...     interpret_code=True,
        ...     code_interpreter=CustomCodeInterpreter()
        ... )
        """
        # Initializing attributes with provided values or default to empty values
        self.name = name
        self.verbose_level = verbose_level
        self.prompt_template = prompt_template

        # Flag to indicate if this is the first call to the Agent
        self.first_call = True
        self.interpret_code = interpret_code
        self.code_interpreter = code_interpreter
        # self.llm_functional_callbacks = llm_functional_callbacks
        
        if self.interpret_code is True and code_interpreter is None:
            raise ValueError(f"You must provide a code interpreter if you want to interpret code for {self.name}.")
            # Initializing hooks with provided values or default to empty lists
            
        self.hooks: "BaseAgent.AgentHooks" = {
            # Initial call hooks, if there is not any present, use the normal call hooks for initial call hooks
            "before_initial_call": or_one_value_to_array(hooks.get("before_initial_call") if hooks.get("before_initial_call", None) is not None else hooks.get("before_call")),
            "alter_initial_call_message": or_one_value_to_array(hooks.get("alter_initial_call_message") if hooks.get("alter_initial_call_message", None) is not None else hooks.get("alter_call_message")),
            "alter_initial_response": or_one_value_to_array(hooks.get("alter_initial_response") if hooks.get("alter_initial_response", None) is not None else hooks.get("alter_response")),
            "after_initial_call": or_one_value_to_array(hooks.get("after_initial_call") if hooks.get("after_initial_call", None) is not None else hooks.get("after_call")),
        
            "before_call": or_one_value_to_array(hooks.get("before_call")),
            "alter_call_message": or_one_value_to_array(hooks.get("alter_call_message")),
            "alter_response": or_one_value_to_array(hooks.get("alter_response")),
            "after_call": or_one_value_to_array(hooks.get("after_call"))
        }
        
        # Initializing verbose formats with provided values or default to the print_agent_prompt_format function
        self.verbose_formats: "BaseAgent.AgentVerboseFormats" = {
            "print_agent_prompt_format": verbose_formats.get("print_agent_prompt_format", print_agent_prompt_format) if verbose_formats is not None else print_agent_prompt_format
        }

    def call(self, message: str) -> str:
        """
        Processes the given message by calling the Large Language Model (Agent), and potentially applies code interpretation. 
        This method is used for all subsequent calls to the Agent after the initial one.

        Parameters
        ----------
        message : str
            The input or query provided to the Agent for this call.

        Returns
        -------
        str
            The response from the Agent, which may include the output of code interpretation if enabled.

        Notes
        -----
        - This method checks if it's the first call to the Agent; if so, it modifies its behavior accordingly.
        - It applies any 'alter_call_message' hooks to modify the message before the call.
        - Executes 'before_call' hooks prior to making the actual call.
        - Constructs the complete prompt, incorporating historical context and formatting.
        - If code interpretation is enabled and relevant, it processes the code found in the response.
        - Executes 'after_call' hooks and updates the historical context with the new interaction.
        - The verbose level controls the level of detail in logging the call process.

        Examples
        --------
        >>> agent = BaseAgent(name="ExampleAgent")
        >>> response = agent.call("What is the weather like today?")
        """
        hook_type = "initial_" if self.first_call else ""
        
        message = self._execute_alter_hooks(f"alter_{hook_type}call_message", message)

        # Execute 'before' hooks
        self._execute_hooks(f"before_{hook_type}call")

        if self.verbose_level >= 2:
            print(f"Calling {self.name} Agent with message {message}")
        # Actual call to the Agent

        response = self._call_llm(self.prompt_template.build_prompt_str(message))

        # If code interpretation is enabled, interpret the code and append the output to the response
        if self.interpret_code is True:
            response = response + "\nCode Output: " + self.code_interpreter.interpret_code(response)
        
        if self.verbose_level >= 1:
            self.verbose_formats["print_agent_prompt_format"](self.name, message, self.prompt_template.parameters["system_message"], response)

        # Execute 'after' hooks
        self._execute_hooks(f"after_{hook_type}call", response)
        
        response = self._execute_alter_hooks(f"alter_{hook_type}response", response)
        
        self.prompt_template.append_history(message, response)
        
        # Set to false on first call
        if self.first_call:
            self.first_call = False
            
        return response
    
    def _call_llm(self, message: str) -> str:
        """
        Acts as a placeholder for the actual interaction with the Large Language Model (Agent). 
        This method is designed to be overridden in subclasses to implement the specific mechanism for calling the Agent.

        Parameters
        ----------
        message : str
            The input or query provided to the Agent for this call.

        Returns
        -------
        str
            A placeholder response string that indicates the details of the call. In a complete implementation, 
            this method should return the actual response from the Agent.

        Notes
        -----
        - This method is a template and is expected to be overridden in a subclass that connects to a real Agent.
        - In its current state, it returns a mock response, showing the provided message to demonstrate how it should be used.

        Examples
        --------
        >>> agent = BaseAgent(name="ExampleAgent")
        >>> response = agent._call_llm("Sample prompt")
        'Calling ExampleAgent Agent with message Sample prompt'
        """
        # Placeholder implementation, to be overridden
        return f"Calling {self.name} Agent with prompt {message}"

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
        if self.hooks is None:
            return

        if self.verbose_level >= 3:
            print(f"Executing hooks for {hook_name} with args {args} and kwargs {kwargs}")
        elif self.verbose_level == 2:
            print(f"Executing hooks for {hook_name}")

        for hook in self.hooks.get(hook_name, []):
            hook(*args, **kwargs)

    def _execute_alter_hooks(self, hook_name: str, message: str) -> str:
        """
        Executes 'alter' hooks associated with the given hook_name to potentially modify the prompt.

        This method iterates through all the hooks registered under the specified hook_name. Each hook is a function 
        that takes the current prompt as an argument and returns a modified version of it. The method applies these 
        modifications sequentially, allowing for cumulative changes to the prompt.

        Parameters
        ----------
        hook_name : str
            The name of the 'alter' hook stage to execute. This identifies the specific group of hooks to be applied.
        message : str
            The current prompt text that may be modified by the hooks.

        Returns
        -------
        str
            The modified prompt after all applicable 'alter' hooks have been executed.

        Examples
        --------
        >>> def add_greeting_to_prompt(prompt):
        ...     return "Hello! " + prompt
        >>> agent = BaseAgent(name="ExampleAgent", hooks={"alter_call_message": [add_greeting_to_prompt]})
        >>> modified_prompt = agent._execute_alter_hooks("alter_call_message", "What is the weather like?")
        >>> print(modified_prompt)
        Hello! What is the weather like?
        """
        
        if self.hooks is None:
            return message
        
        for hook in self.hooks.get(hook_name, []):
            message = hook(message)
        return message

    def summary(self):
        return str({
            "name": self.name,
            "agent_class": self.__class__.__name__,
            "hooks": self.hooks,
            "prompt": self.prompt_template.summary(),
        })
