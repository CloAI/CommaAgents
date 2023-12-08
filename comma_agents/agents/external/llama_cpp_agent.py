


from typing import Optional, TypedDict
from comma_agents.agents.base_agent import BaseAgent
from llama_cpp import Llama

class LLaMaAgent(BaseAgent):
    class LLaMaAgentConfig(TypedDict, total=True):
        """Configuration for LLaMa Agent
        """
        model_path: str
    
    def __init__(
        self,
        name: str,
        system_prompt: str = None,
        keep_historical_context: bool = False,
        verbose_level: int = 1,
        hooks: "BaseAgent.AgentHooks" = {},
        verbose_formats: "BaseAgent.AgentVerboseFormats" = {},
        llama_config: "LLaMaAgent.LLaMaAgentConfig" = {},
        history_context_window_size: Optional[int] = None
    ):
        super().__init__(name, system_prompt, keep_historical_context, verbose_level, hooks, verbose_formats, history_context_window_size)
        if llama_config.get("verbose", None) is None:
            llama_config["verbose"] = False
        
        self.lamma_config = llama_config
        self.llm = Llama(**self.lamma_config)
        
    def _call_llm(self, prompt='', *args, **kwargs):
        response = self.llm(prompt)
        return response["choices"][0]["text"]