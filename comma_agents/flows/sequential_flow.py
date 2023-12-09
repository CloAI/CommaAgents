from comma_agents.agents import BaseAgent
from comma_agents.flows import BaseFlow

class SequentialFlow(BaseFlow):
    """
    SequentialFlow is a subclass of BaseFlow designed to execute a series of flows or agents sequentially.

    In this class, each flow or agent in the `flows` list is executed in order, with the output of one 
    being passed as the input to the next. This allows for creating a chain of agents or flows where the 
    output of one element informs the input of the next.

    Parameters
    ----------
    **kwargs
        Arbitrary keyword arguments that are passed to the BaseFlow's constructor for further customization.

    Methods
    -------
    _run_flow(prompt=None)
        Executes the flows in the sequence, passing the output of one as the input to the next.

    Examples
    --------
    >>> agent1 = BaseAgent(name="Agent1")
    >>> agent2 = BaseAgent(name="Agent2")
    >>> sequential_flow = SequentialFlow(flows=[agent1, agent2])
    >>> response = sequential_flow.run_flow(prompt="Start")
    """

    def __init__(self, **kwargs):
        """
        Initializes a new instance of the SequentialFlow class.

        The constructor inherits the configurations from BaseFlow and sets up the flow for sequential execution.

        Parameters
        ----------
        **kwargs
            Additional keyword arguments for BaseFlow configuration.
        """
        super().__init__(**kwargs)

    def _run_flow(self, prompt=None):
        """
        Executes each flow or agent in the `flows` list sequentially.

        The output of one flow or agent is passed as the input to the next in the sequence. If an element 
        in `flows` is neither a BaseAgent nor a BaseFlow, a TypeError is raised.

        Parameters
        ----------
        prompt : str, optional
            The initial prompt to start the sequential flow. Default is None.

        Returns
        -------
        str
            The final response generated after executing all elements in the sequence.

        Raises
        ------
        TypeError
            If an element in `flows` is neither a BaseAgent nor a BaseFlow.

        Examples
        --------
        >>> agent1 = BaseAgent(name="EchoAgent")
        >>> agent2 = BaseAgent(name="ResponseAgent")
        >>> sequential_flow = SequentialFlow(flows=[agent1, agent2])
        >>> response = sequential_flow._run_flow(prompt="Hello")
        'Final response from ResponseAgent'
        """
        previous_response = prompt
        for flow in self.flows:
            # Check if the element is an agent or another flow
            if isinstance(flow, BaseAgent):
                response = flow.call(previous_response)
            elif isinstance(flow, BaseFlow):
                response = flow.run_flow(previous_response)
            else:
                raise TypeError("Unsupported flow type")

            previous_response = response  # Update the prompt for the next agent/flow

        return response
