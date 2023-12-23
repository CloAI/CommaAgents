from comma_agents.flows import BaseFlow

class TestBaseFlowInit:
    
    def test_init_defaults(self):
        """
        Test to verify the initialization of the BaseFlow object.
        """
        flow = BaseFlow("TestFlow")
        assert isinstance(flow, BaseFlow)
        assert flow.name == 'TestFlow'
        
