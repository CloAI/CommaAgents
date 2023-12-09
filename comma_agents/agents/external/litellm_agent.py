from comma_agents.agents import BaseAgent
from litellm import completion

class LiteLLMAgent(BaseAgent):
    """
    A subclass of BaseAgent that interfaces with a Lite Large Language Model (LLM).

    LiteLLMAgent is designed to facilitate interactions with a lightweight LLM, handling the formatting 
    and sending of prompts to the model and processing its responses. It extends the functionalities of 
    BaseAgent by integrating with the LiteLLM's completion API.

    Parameters
    ----------
    name : str, optional
        The name of the agent, primarily used for identification and logging. Default is 'Lite LLM Agent'.
    model_name : str
        The name of the Lite LLM model to be used for generating completions.
    **kwargs
        Arbitrary keyword arguments that are passed to the BaseAgent's constructor for further customization.

    Attributes
    ----------
    model_name : str
        Stores the name of the Lite LLM model that this agent interacts with.

    Methods
    -------
    _call_llm(prompt, **kwargs)
        Sends a prompt to the Lite LLM and returns its completion response.

    Examples
    --------
    >>> lite_agent = LiteLLMAgent(name="MyLiteAgent", model_name="gpt-3.5-turbo")
    >>> response = lite_agent._call_llm("Translate 'Hello' to French.")
    """

    def __init__(self, name='Lite LLM Agent', model_name='', **kwargs):
        """
        Initializes a new instance of the LiteLLMAgent class.

        This constructor sets up the agent with the specified Lite LLM model and inherits additional 
        configurations from BaseAgent.

        Parameters
        ----------
        name : str, optional
            The name of the agent. Default is 'Lite LLM Agent'.
        model_name : str
            The name of the Lite LLM model to be used.
        **kwargs
            Additional keyword arguments for BaseAgent configuration.
        """
        super().__init__(name=name, **kwargs)
        self.model_name = model_name

    def _call_llm(self, prompt, **kwargs):
        """
        Sends the given prompt to the Lite LLM model and returns the model's response.

        This method overrides the BaseAgent's _call_llm method to interact with the Lite LLM. It sends 
        the prompt to the model and retrieves its completion response.

        Parameters
        ----------
        prompt : str
            The prompt or message to send to the Lite LLM.
        **kwargs
            Additional keyword arguments that can be used in the completion request.

        Returns
        -------
        str
            The content of the response message from the Lite LLM model.

        Examples
        --------
        >>> lite_agent = LiteLLMAgent(model_name="gpt-3.5-turbo")
        >>> response = lite_agent._call_llm("What is the capital of France?")
        'Paris'
        """
        response = completion(
            model=self.model_name,
            messages=[
                {
                    "content": prompt,
                    "role": "user"
                }
            ])
        return response.choices[0].message.content
