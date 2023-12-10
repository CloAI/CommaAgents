import os

from colorama import Fore, Style
from comma_agents.agents import BaseAgent

def print_user_agent_prompt_format(
    agent_name: str,
    prompt: str = None,
    response: str = None,
    system_prompt: bool = None,
    use_unicode: bool = True
):
    """
        Prints a formatted prompt and response for a user-agent interaction in a console environment. 
        This function is designed to visually differentiate between user inputs, agent responses, 
        and system-generated prompts using color coding and Unicode characters.

        Parameters
        ----------
        agent_name : str
            The name of the agent that is interacting with the user.
        prompt : str, optional
            The initial prompt from the user. If provided, it is printed as part of the output. Default is None.
        response : str, optional
            The response from the agent. If provided, it is printed as part of the output. Default is None.
        system_prompt : bool, optional
            A flag to indicate if the prompt is system-generated. This affects the formatting. Default is None.
        use_unicode : bool, optional
            A flag to decide if Unicode characters are used for icons in the output. Default is True.

        Notes
        -----
        - The function uses different colors to distinguish between the agent name, user prompt, and agent response.
        - Unicode characters are used for visual elements like icons, but can be disabled with the `use_unicode` flag.
        - The output is formatted with separators to visually segment different parts of the interaction.
        - If `system_prompt` is True, the prompt is formatted differently to indicate it's a system-generated message.

        Examples
        --------
        >>> print_user_agent_prompt_format("ExampleAgent", prompt="Hello, agent!", response="Hello, user!")
        # Output will include the agent's name, user's prompt, and agent's response, each in a formatted style.
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

    # If a prompt is provided, print it in yellow
    if response:
        print(speaking_head + Fore.YELLOW + " Prompt: " + response + Style.RESET_ALL)

    # Print the separator again
    print("#" * width)

class UserAgent(BaseAgent):
    """
    UserAgent is a subclass of BaseAgent specifically tailored for user-agent interactions. 
    It initializes a user-centric agent with customizable prompts, name, and other settings.

    This class extends the BaseAgent by allowing for user-specific configurations and behaviors, 
    such as requiring user input or customizing initial prompts.

    Parameters
    ----------
    name : str, optional
        The name of the UserAgent. This name is used for identification and logging. Default is an 'UserAgent'.
    prompt : str, optional
        The initial prompt or message that the UserAgent will use. Default is an empty string.
    require_input : bool, optional
        A flag to indicate whether the UserAgent requires input from the user to proceed. Default is False.
    **kwargs
        Arbitrary keyword arguments. These are passed to the BaseAgent's __init__ method for further customization.

    Attributes
    ----------
    prompt : str
        Stores the initial prompt of the UserAgent.
    require_input : bool
        Indicates whether user input is required for the UserAgent's operations.

    Notes
    -----
    - The UserAgent class uses the `print_user_agent_prompt_format` function from the BaseAgent for formatting outputs.
    - This class can be used in scenarios where specific user-agent interaction patterns are required.

    Examples
    --------
    >>> user_agent = UserAgent(prompt="Hello! How can I assist you?", name="HelpBot", require_input=True)
    """

    def __init__(self, name='UserAgent', prompt='', require_input: bool = False, **kwargs):
        """
        Initializes an instance of the UserAgent class.

        The UserAgent class extends the BaseAgent by adding specific properties and behaviors suitable for 
        user-agent interactions. It allows the setting of an initial prompt, a flag to indicate the requirement 
        of user input, and additional customization through keyword arguments.

        Parameters
        ----------
        name : str, optional
            The name of the UserAgent, primarily used for identification and logging. Default is 'UserAgent'.
        prompt : str, optional
            An initial prompt or message that the UserAgent will present or utilize. Default is an empty string.
        require_input : bool, optional
            A flag to determine if the UserAgent should wait for user input before proceeding. Default is False.
        **kwargs
            Additional keyword arguments that are passed to the BaseAgent's constructor for further customization.

        Attributes
        ----------
        prompt : str
            Holds the initial prompt set for the UserAgent.
        require_input : bool
            Indicates whether the UserAgent requires input from the user for its operations.

        Examples
        --------
        >>> user_agent = UserAgent(name="HelpBot", prompt="How may I assist you?", require_input=True)
        """

        super().__init__(
            name=name,
            verbose_formats={
                "print_agent_prompt_format": print_user_agent_prompt_format,
            },
            **kwargs
        )
        self.prompt = prompt
        self.require_input = require_input
   
    def _call_llm(self, **kwargs):
        """
        Handles the call to the Large Language Model (LLM) based on the configuration of the UserAgent.

        This method overrides the `_call_llm` method from the BaseAgent class. It determines how to 
        handle the agent's interaction based on the 'require_input' flag. If 'require_input' is True, 
        it prompts the user for input. Otherwise, it simply returns the preset prompt.

        Parameters
        ----------
        **kwargs
            Arbitrary keyword arguments. These can be used to pass additional data required for the LLM call.

        Returns
        -------
        str
            The user's input if 'require_input' is True, or the preset prompt otherwise.

        Notes
        -----
        - This method should be tailored to fit the specific needs of the LLM interaction in a subclass.
        - In its current implementation, it does not make an actual call to an LLM, but this behavior can be 
        implemented in a subclass by overriding this method.

        Examples
        --------
        With require_input set to True
        >>> user_agent = UserAgent(require_input=True)
        >>> response = user_agent._call_llm()
        User input: <user types "Hello">
        'Hello'

        With require_input set to False
        >>> user_agent = UserAgent(prompt="What is the weather like?", require_input=False)
        >>> response = user_agent._call_llm()
        'What is the weather like?'
        """

        if self.require_input:
            return input("User input: ")
        return self.prompt
        
    