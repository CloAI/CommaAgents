from comma_agents.agents.base_agent import BaseAgent
from llama_cpp import Llama

class LLaMaAgent(BaseAgent):
    """
    A subclass of BaseAgent designed for interaction with the LLaMa model.

    This agent extends the BaseAgent functionalities by integrating with a LLaMa model, 
    allowing for easy handling and processing of interactions with this specific language model.

    Parameters
    ----------
    name : str
        The name of the agent, used for identification and logging purposes.
    llama_config : dict, optional
        Configuration settings for initializing the LLaMa model. Default is an empty dictionary.
    **kwargs
        Arbitrary keyword arguments that are passed to the BaseAgent's constructor for further customization.

    Attributes
    ----------
    llama_config : dict
        Stores the configuration settings for the LLaMa model.
    llm : Llama
        An instance of the LLaMa model initialized with the provided configuration settings.

    Methods
    -------
    _call_llm(prompt='', *args, **kwargs)
        Sends a prompt to the LLaMa model and returns its response.

    Examples
    --------
    >>> llama_agent = LLaMaAgent(name="MyLLaMaAgent", llama_config={"verbose": True})
    >>> response = llama_agent._call_llm("What is the capital of France?")
    """

    def __init__(self, name: str, llama_config={}, unload_on_completion: bool = False, **kwargs):
        """
        Initializes a new instance of the LLaMaAgent class.

        The constructor sets up the agent with the specified LLaMa model configuration and inherits 
        additional configurations from BaseAgent.

        Parameters
        ----------
        name : str
            The name of the agent.
        llama_config : dict, optional
            The configuration settings for the LLaMa model. Default is an empty dictionary.
        **kwargs
            Additional keyword arguments for BaseAgent configuration.
        """
        super().__init__(name=name, **kwargs)
        if llama_config.get("verbose", None) is None:
            llama_config["verbose"] = False

        # If the user has not manually set the 'last_n_tokens_size' we set it to 0 so that every chat is unique, but also uses the full context as reference.
        if llama_config.get("last_n_tokens_size", None) is None:
            llama_config["last_n_tokens_size"] = 0

        self.lamma_config = llama_config
        self.unload_on_completion = unload_on_completion
        self.llm = Llama(**self.lamma_config)

    def _call_llm(self, prompt='', *args, **kwargs):
        """
        Sends the provided prompt to the LLaMa model and retrieves its response.

        This method is an override of the _call_llm method from BaseAgent, tailored to interact 
        with the LLaMa model. It sends the prompt to the model and returns the text content of the model's response.

        Parameters
        ----------
        prompt : str, optional
            The prompt or message to send to the LLaMa model. Default is an empty string.
        *args
            Variable length argument list, representing additional arguments for the LLaMa call.
        **kwargs
            Arbitrary keyword arguments for the LLaMa call.

        Returns
        -------
        str
            The content of the response from the LLaMa model.

        Examples
        --------
        >>> llama_agent = LLaMaAgent(name="LLaMaBot")
        >>> response = llama_agent._call_llm("Translate 'Hello' to Spanish.")
        'Hola'
        """
        # If we are unloading the model after each call, we need to reinitialize it.
        if self.unload_on_completion is True and not hasattr(self, 'llm'):
            self.llm = Llama(**self.lamma_config)
        
        response = self.llm(prompt)
        
        # If we are unloading the model after each call, we need to delete the instance after to free up resources.
        if self.unload_on_completion is True:
            del self.llm
        
        return response["choices"][0]["text"]