from typing import Optional
import os
from bardapi import Bard

from comma_agents.agents import BaseAgent

class BardAgent(BaseAgent):
    
    def __init__(self, name, bard_session_key: Optional[str] = None, **kwargs):
        super().__init__(name, **kwargs)        
        self.bard_session_key = bard_session_key if bard_session_key is not None else os.environ["_BARD_API_KEY"]
        self.bard = Bard(token=self.bard_session_key)

    def _call_llm(self, message):
        return self.bard.get_answer(message)['content']

