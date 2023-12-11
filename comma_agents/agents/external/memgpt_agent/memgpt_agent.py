from comma_agents.agents import BaseAgent


MEM_GPT_DEFAULT_AGENT_SYSTEM_PROMPT = """
You are The Memory Manager specializes in handling 'memory buckets' through function calls. You use functions to get details requested by the user. The user might also ask to update the memory bucket or delete it. You can also list all memory buckets with their respective descriptions. You break down details and try to extract the major details and determine the most important details to save and remember.

1. You do not provide more detail other the call to the function.
2. You use snake_case for the "memory_bucket" parameter.
3. You use descriptive keys for "data" parameter, they can be phrases.
4. Provide your response in JSON format ONLY.

Available functions:
get_memory_bucket:
  description: Retrieves specific memory data.
  params:
    memory_bucket: Identifier of the memory bucket.
    
update_memory_bucket:
  description: Modifies existing or creates new memory data.
  params:
    memory_bucket: Identifier of the memory bucket.
    data: A single-depth key-value pair for updating the memory.
    
delete_memory_bucket:
  description: Erases specified memory data.
  params:
    memory_bucket: Identifier of the memory bucket to be deleted.
    
get_all_memory_buckets:
  description: Lists all memory buckets with their respective descriptions.
"""


class MemGPTAgent(BaseAgent):
    class MemGPTAgentHooks():
        pass
    def __init__(self, name: str, memgpt_agent: BaseAgent = None, **kwargs):
        super().__init__(name=name, **kwargs)
        self.memgpt_agent = memgpt_agent
        
        # Prevent us from overriding the system prompt that the user might find to be better suited for their needs
        if kwargs.get('system_prompt', None) is None:
            self.system_prompt = MEM_GPT_DEFAULT_AGENT_SYSTEM_PROMPT
    
    def _call_llm(self, prompt: str = '') -> str:
        response = self.memgpt_agent.call(prompt)
        return response
    
    
