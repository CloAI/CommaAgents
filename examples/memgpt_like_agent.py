from comma_agents.agents import BaseAgent
from comma_agents.agents.external.memgpt_agent.memgpt_agent import MemGPTAgent
from comma_agents.agents.external.llama_cpp_agent import LLaMaAgent


llama_prompt_format: BaseAgent.AgentPromptFormats = {
    "system_message_start_token": "[INST] <<SYS>>\n",
    "system_message_end_token": "\n<</SYS>>\n",
    "user_message_start_token": "",
    "user_message_end_token": "\n[/INST]\n",
    "assistant_message_start_token": "",
    "assistant_message_end_token": ""
}
airoboros_agent = LLaMaAgent(
    name="Airoboros Agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/Airoboros-M-7B-3.1.2-GGUF/airoboros-m-7b-3.1.2.Q4_K_M.gguf"
    },
    prompt_formats=llama_prompt_format
)

memgpt_agent = MemGPTAgent(
    name="MemGPT Agent",
    memgpt_agent = airoboros_agent
)

# memgpt_agent.call("get_memory_bucket for the favorite food for Nathan.")

memgpt_agent.call("Nathan's favorite food to Pizza.")
