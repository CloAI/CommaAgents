import os

from colorama import Fore, Style
from comma_agents.agents import BaseAgent

def print_user_agent_prompt_format(
    agent_name: str,
    message: str = None,
    system_message: str = None,
    response: str = None,
    use_unicode: bool = True
):
    """
    Prints a formatted prompt and response for a user-agent interaction in a console environment. 
    This function is designed for visual differentiation of user inputs, agent responses, 
    and system-generated prompts, incorporating color coding and Unicode characters for clarity.

    Parameters
    ----------
    agent_name : str
        The name of the agent involved in the interaction.
    message : str, optional
        The message or prompt from the user. If provided, it is included in the output. Default is None.
    system_message : str, optional
        The system-generated message, if any, formatted distinctly. Default is None.
    response : str, optional
        The response from the agent. If provided, it is included in the output. Default is None.
    use_unicode : bool, optional
        Determines whether Unicode characters are used for icons in the output. Default is True.

    Notes
    -----
    - Different colors are used to distinguish between the agent's name, user message, system message, and agent response.
    - Unicode characters add visual elements like icons, enhancing readability, but can be omitted with `use_unicode` set to False.
    - The output is formatted with separators and styles to clearly segment the interaction's components.
    - System messages are formatted differently to signify that they are generated by the system, not by the user or agent.

    Examples
    --------
    >>> print_user_agent_prompt_format("ExampleAgent", message="Hello, agent!", system_message="System message", response="Hello, user!")
    # Output will include the agent's name, user's message, system message, and agent's response, each formatted distinctively.
    """

    # Unicode characters for silhouette and speaking head, fall back to text representation if use_unicode is False
    bust_in_silhouette = '\U0001F464' if use_unicode else '[:bust_in_silhouette:]'
    speaking_head = '\U0001F5E3' if use_unicode else '[:speaking_head:]'
    
    # Get the width of the terminal for printing separators
    width = os.get_terminal_size().columns

    # Print the separator line across the terminal width
    print("#" * width)

    # Print the user's name with a silhouette icon, in cyan color
    print(bust_in_silhouette + Fore.CYAN + "User: " + agent_name + Style.RESET_ALL)

    if response:
        print(speaking_head + Fore.YELLOW + " Prompt: " + response + Style.RESET_ALL)

    # Print the separator again
    print("#" * width)

class UserAgent(BaseAgent):
    """
    UserAgent is a specialized subclass of BaseAgent, designed for user-agent interactions. 
    It extends the BaseAgent functionalities to cater specifically to user-centered scenarios, 
    allowing customizable prompts, names, and other settings tailored to user interactions.

    This class enhances user-specific configurations and behaviors, such as custom initial prompts and 
    the option to require user input.

    Parameters
    ----------
    name : str, optional
        The name of the UserAgent, used for identification and logging purposes. Default is 'UserAgent'.
    user_message : str, optional
        The default message or prompt the UserAgent will use if no user input is required. Default is an empty string.
    require_input : bool, optional
        A flag to indicate whether the UserAgent requires user input to proceed. Default is False.
    **kwargs
        Arbitrary keyword arguments for additional customization, passed to the BaseAgent's __init__ method.

    Attributes
    ----------
    user_message : str
        Stores the default or initial message of the UserAgent.
    require_input : bool
        Indicates whether user input is required for the UserAgent's operations.

    Notes
    -----
    - The UserAgent class is ideal for scenarios requiring specific user-agent interaction patterns.
    - It uses the `print_user_agent_prompt_format` function from the BaseAgent for output formatting.

    Examples
    --------
    >>> user_agent = UserAgent(name="HelpBot", user_message="Hello! How can I assist you?", require_input=True)
    """

    def __init__(self, name='UserAgent', **kwargs):
        """
        Initializes an instance of the UserAgent class.

        This constructor extends BaseAgent by adding specific properties and behaviors for user-agent interactions.
        It allows customization of an initial user message, a flag for requiring user input, and other settings via keyword arguments.

        Parameters
        ----------
        name : str, optional
            The name of the UserAgent, for identification and logging. Default is 'UserAgent'.
        user_message : str, optional
            An initial message or prompt used by the UserAgent. Default is an empty string.
        require_input : bool, optional
            Indicates whether the UserAgent waits for user input before proceeding. Default is False.
        **kwargs
            Additional keyword arguments for further customization, passed to BaseAgent's constructor.

        Attributes
        ----------
        user_message : str
            The initial message or prompt set for the UserAgent.
        require_input : bool
            Indicates if the UserAgent requires user input for operations.

        Examples
        --------
        >>> user_agent = UserAgent(name="HelpBot", user_message="How may I assist you?", require_input=True)
        """
        super().__init__(
            name=name,
            verbose_formats={
                "print_agent_prompt_format": print_user_agent_prompt_format,
            },
            **kwargs
        )
        self.user_message = kwargs.get('user_message', '')
        self.require_input = kwargs.get('require_input', False)

    def _call_llm(self, message: str = '', **kwargs):
        """
        Overrides BaseAgent's `_call_llm` method to handle the UserAgent's interaction with the Large Language Model (LLM).

        This method customizes the interaction based on the UserAgent's configuration, particularly the 'require_input' flag. 
        If 'require_input' is True, it prompts the user for input; otherwise, it uses the set user_message.

        Parameters
        ----------
        message : str, optional
            The input message for the LLM call, if any. Default is an empty string.
        **kwargs
            Arbitrary keyword arguments for additional data or customization in the LLM call.

        Returns
        -------
        str
            The response based on user input (if 'require_input' is True) or the preset user_message.

        Notes
        -----
        - This method should be adapted to fit specific LLM interaction needs in a subclass.
        - In its current form, it does not perform a real LLM call, but this can be implemented in a subclass.

        Examples
        --------
        With 'require_input' set to True:
        >>> user_agent = UserAgent(require_input=True)
        >>> response = user_agent._call_llm()
        User input: <user types "Hello">
        'Hello'

        With 'require_input' set to False:
        >>> user_agent = UserAgent(user_message="What is the weather like?", require_input=False)
        >>> response = user_agent._call_llm()
        'What is the weather like?'
        """
        if self.require_input:
            return input("User input: ")
        return self.user_message
