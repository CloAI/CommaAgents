from typing import Callable, List, Union, Optional, Any, Dict, TypedDict

from comma_agents.agents import BaseAgent
from comma_agents.utils.misc import or_one_value_to_array

class BaseFlow:
    """
    BaseFlow is a class for managing and executing a sequence of flows, where each flow can be an 
    instance of BaseAgent or another BaseFlow. This class facilitates creating complex interaction 
    workflows by sequencing and nesting agents and flows.

    Parameters
    ----------
    flows : Union[BaseAgent, BaseFlow, List[Union[BaseAgent, BaseFlow]]], optional
        A single or a list of BaseAgent or BaseFlow instances that constitute the flow. Default is an empty list.
    verbose_level : int, optional
        The verbosity level for output logging during flow execution. Default is 1.
    flow_name : str, optional
        The name of the flow, used primarily for identification and logging. Default is an empty string.
    hooks : BaseFlow.FlowHooks, optional
        Custom hooks for different stages of the flow execution. Default is an empty dictionary.

    Attributes
    ----------
    flows : List[Union[BaseAgent, BaseFlow]]
        The list of flows (BaseAgent or BaseFlow instances) to be executed.
    flow_name : str
        The name assigned to this flow.
    verbose_level : int
        The verbosity level for output logging.
    hooks : Dict[str, List[Callable[..., Any]]]
        The dictionary of hooks for different stages of flow execution.

    Methods
    -------
    run_flow(prompt='')
        Executes the flow with an optional initial prompt.
    _run_flow(prompt='')
        A placeholder method for the actual flow execution logic.
    _execute_hooks(hook_name, *args, **kwargs)
        Executes a set of hooks based on the provided hook name.
    _execute_alter_hooks(hook_name, prompt)
        Modifies the given prompt using specified 'alter' hooks.

    Examples
    --------
    >>> agent = BaseAgent(name="ExampleAgent")
    >>> flow = BaseFlow(flows=[agent], flow_name="ExampleFlow")
    >>> response = flow.run_flow(prompt="Hello")
    """

    class FlowHooks(TypedDict, total=False):
        """
        A TypedDict defining the structure and types of hooks that can be used in BaseFlow.

        Attributes
        ----------
        before_flow : Optional[Callable[..., Any]]
            Hook to be executed before the flow starts.
        alter_prompt_before_flow : Optional[Callable[..., Any]]
            Hook to modify the initial prompt before the flow starts.
        after_flow : Optional[Callable[..., Any]]
            Hook to be executed after the flow ends.
        alter_prompt_after_flow : Optional[Callable[..., Any]]
            Hook to modify the final response after the flow ends.
        """
        before_flow: Optional[Callable[..., Any]]
        alter_prompt_before_flow: Optional[Callable[..., Any]]
        after_flow: Optional[Callable[..., Any]]
        alter_prompt_after_flow: Optional[Callable[..., Any]]

    def __init__(
            self,
            flows: Union[BaseAgent, 'BaseFlow', List[Union[BaseAgent, 'BaseFlow']]] = [],
            verbose_level: int = 1,
            flow_name: str = "",
            hooks: "BaseFlow.FlowHooks" = {},):
        """
        Initializes a new instance of the BaseFlow class.

        This constructor sets up the flow with the specified sequence of agents or flows, verbosity level, 
        flow name, and custom hooks.

        Parameters
        ----------
        flows : Union[BaseAgent, BaseFlow, List[Union[BaseAgent, BaseFlow]]], optional
            The flows to include in this BaseFlow instance. Default is an empty list.
        verbose_level : int, optional
            The verbosity level for output logging. Default is 1.
        flow_name : str, optional
            The name of the flow. Default is an empty string.
        hooks : BaseFlow.FlowHooks, optional
            The custom hooks for different stages of the flow. Default is an empty dictionary.
        """
        # If a single flow or agent is passed, convert it to a list
        if isinstance(flows, (BaseAgent, BaseFlow)):
            flows = [flows]

        # Ensure that flows is a list of BaseAgent or BaseFlow instances
        if not all(isinstance(flow, (BaseAgent, BaseFlow)) for flow in flows):
            raise ValueError("All elements in flows must be instances of BaseAgent or BaseFlow")
        
        self.flows = flows
        self.flow_name = flow_name
        self.verbose_level = verbose_level

        # Initializing hooks with provided values or default to empty lists
        self.hooks: Dict[str, List[Callable[..., Any]]] = {
            "before_flow": or_one_value_to_array(hooks.get("before_flow")),
            "alter_prompt_before_flow": or_one_value_to_array(hooks.get("alter_prompt_before_flow")),
            "after_flow": or_one_value_to_array(hooks.get("after_flow")),
            "alter_prompt_after_flow": or_one_value_to_array(hooks.get("alter_prompt_after_flow")),
        }

        if verbose_level > 0:
            for flow in self.flows:
                if isinstance(flow, BaseAgent):
                    flow.verbose_level = verbose_level

    def run_flow(self, prompt=""):
        """
        Executes the entire flow, starting with an optional initial prompt.

        This method orchestrates the execution of the flow, applying hooks and managing the sequence 
        of interactions defined in the `flows` attribute.

        Parameters
        ----------
        prompt : str, optional
            An initial prompt to start the flow. Default is an empty string.

        Returns
        -------
        str
            The final response generated after executing the entire flow.

        Examples
        --------
        >>> flow = BaseFlow(flows=[BaseAgent(name="Agent1")], flow_name="MyFlow")
        >>> response = flow.run_flow(prompt="Start the flow")
        """
        self._execute_hooks("before_flow")
        prompt = self._execute_alter_hooks("alter_prompt_before_flow", prompt=prompt)
        response = self._run_flow(prompt)
        self._execute_hooks("after_flow")
        response = self._execute_alter_hooks("alter_prompt_after_flow", prompt=response)
        return response

    def _run_flow(self, prompt=""):
        """
        A placeholder method designed to be overridden by subclasses to implement the specific logic of 
        running the flow with the given prompt.

        This method is intended to encapsulate the core logic of how the flow processes a prompt. In its 
        base form, it returns a simple string indicating that the flow has been called with the provided 
        prompt. Subclasses should override this method to provide the actual implementation of the flow's 
        behavior with the LLM or other components.

        Parameters
        ----------
        prompt : str, optional
            The prompt or input message to the flow. Default is an empty string.

        Returns
        -------
        str
            The result of processing the prompt within the flow. In this placeholder implementation, it 
            simply returns a formatted string indicating the flow name and the prompt.

        Notes
        -----
        - Subclasses should override this method to implement the specific interaction logic with the LLM 
        or other processes constituting the flow.
        - This method is typically called by `run_flow`, which manages pre- and post-processing hooks.

        Examples
        --------
        In a subclass:

        >>> class CustomFlow(BaseFlow):
        ...     def _run_flow(self, prompt=""):
        ...         # Custom logic for handling the prompt
        ...         return "Processed prompt: " + prompt

        >>> custom_flow = CustomFlow(flow_name="CustomFlow")
        >>> response = custom_flow._run_flow("Test prompt")
        'Processed prompt: Test prompt'
        """
        return f"Calling {self.flow_name} LLM with prompt {prompt}"

    def _execute_hooks(self, hook_name, *args, **kwargs):
        """
        Executes a set of hooks identified by the provided hook name.

        This method iterates through all the hooks registered under the specified `hook_name` and 
        executes each one, passing along any additional arguments and keyword arguments provided.

        Parameters
        ----------
        hook_name : str
            The name of the hook stage to be executed. This corresponds to a key in the `hooks` attribute.
        *args
            Variable length argument list. These are the arguments that will be passed to each hook function.
        **kwargs
            Arbitrary keyword arguments. These will be passed to each hook function.

        Notes
        -----
        - The method supports verbose output. At verbosity level 3, it prints detailed information about the 
        hook execution, including the arguments and keyword arguments. At level 2, it announces the hook stage execution.
        - Hooks are functions defined to be executed at specific stages of the flow. They allow for customization 
        of behavior at these stages.

        Examples
        --------
        >>> def my_hook(arg1, arg2):
        ...     print(f"Hook executed with arguments: {arg1}, {arg2}")
        >>> flow = BaseFlow(hooks={"before_flow": [my_hook]}, verbose_level=3)
        >>> flow._execute_hooks("before_flow", "argument1", "argument2")
        Executing hooks for before_flow with args ('argument1', 'argument2') and kwargs {}
        Hook executed with arguments: argument1, argument2
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
        >>> flow = BaseFlow(hooks={"alter_prompt_before_flow": [add_greeting_to_prompt]})
        >>> modified_prompt = flow._execute_alter_hooks("alter_prompt_before_flow", "What's the weather like?")
        >>> print(modified_prompt)
        Hello! What's the weather like?
        """

        for hook in self.hooks.get(hook_name, []):
            prompt = hook(prompt)
        return prompt