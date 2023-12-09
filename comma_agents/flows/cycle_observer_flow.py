from comma_agents.flows import CycleFlow
from comma_agents.agents import BaseAgent

class CycleObserverFlow(CycleFlow):
    """
    CycleObserverFlow is a subclass of CycleFlow that incorporates an additional 'observer' agent into the cycle flow.

    This class extends CycleFlow by adding an observer agent, which is executed after each cycle of the flow. 
    The observer agent can analyze, modify, or augment the output of the cycle before it is used in the next cycle 
    or returned as the final response.

    Parameters
    ----------
    observer_agent : BaseAgent, optional
        An instance of BaseAgent that acts as the observer in the cycle flow. Default is None.
    **kwargs
        Arbitrary keyword arguments that are passed to the CycleFlow's constructor for further customization.

    Attributes
    ----------
    observer_agent : BaseAgent
        The observer agent that is executed after each cycle of the flow.

    Methods
    -------
    alter_prompt_after_cycle(prompt='')
        Modifies the prompt after each cycle using the observer agent.

    Raises
    ------
    ValueError
        If the provided observer_agent is not an instance of BaseAgent.

    Examples
    --------
    >>> observer = BaseAgent(name="ObserverAgent")
    >>> cycle_observer_flow = CycleObserverFlow(observer_agent=observer, cycles=2)
    >>> response = cycle_observer_flow.run_flow(prompt="Initial prompt")
    """

    def __init__(self, observer_agent=None, **kwargs):
        """
        Initializes a new instance of the CycleObserverFlow class.

        This constructor sets up the cycle observer flow with the specified observer agent and inherits 
        additional configurations from CycleFlow.

        Parameters
        ----------
        observer_agent : BaseAgent, optional
            An instance of BaseAgent to observe and potentially modify the output after each cycle. Default is None.
        **kwargs
            Additional keyword arguments for CycleFlow configuration.
        """
        if not isinstance(observer_agent, BaseAgent):
            raise ValueError("observer_agent must be an instance of BaseAgent")
        super().__init__(**kwargs)
        self.observer_agent = observer_agent
        self.hooks["alter_prompt_after_cycle"].insert(0, self.alter_prompt_after_cycle)

    def alter_prompt_after_cycle(self, prompt=""):
        """
        Executes the observer agent on the given prompt and returns its response.

        This method overrides the 'alter_prompt_after_cycle' hook of CycleFlow. It is called after each 
        cycle of the flow, allowing the observer agent to analyze or modify the prompt.

        Parameters
        ----------
        prompt : str, optional
            The prompt or output from the current cycle. Default is an empty string.

        Returns
        -------
        str
            The response from the observer agent, to be used as the input for the next cycle or as the final output.

        Examples
        --------
        >>> observer = BaseAgent(name="ObserverAgent")
        >>> cycle_observer_flow = CycleObserverFlow(observer_agent=observer)
        >>> modified_prompt = cycle_observer_flow.alter_prompt_after_cycle(prompt="Test prompt")
        """
        response = self.observer_agent.call(prompt)
        return response
