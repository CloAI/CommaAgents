from comma_agents.agents import BaseAgent
from comma_agents.agents.external.llama_cpp_agent import LLaMaAgent
from comma_agents.strategies.memory_strategy import MemoryStrategy


llama_prompt_format: BaseAgent.AgentPromptFormats = {
    "system_message_start_token": "",
    "system_message_end_token": "\n",
    "user_message_start_token": "USER: ",
    "user_message_end_token": "\n",
    "assistant_message_start_token": "ASSISTANT: ",
    "assistant_message_end_token": ""
}

memgpt_agent = MemoryStrategy(
    memory_processor_agent=LLaMaAgent(
    name="memory_processor_agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/airoboros-mistral2.2-7B-GGUF/airoboros-mistral2.2-7b.Q5_K_M.gguf",
        "n_ctx": 2048,
    },
    
    unload_on_completion=True
),
    question_extractor_agent=LLaMaAgent(
    name="question_extractor_agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/airoboros-mistral2.2-7B-GGUF/airoboros-mistral2.2-7b.Q5_K_M.gguf",
        "n_ctx": 2048,
    },
    prompt_formats=llama_prompt_format,
    unload_on_completion=True
),
    statement_extractor_agent=LLaMaAgent(
    name="statement_extractor_agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/airoboros-mistral2.2-7B-GGUF/airoboros-mistral2.2-7b.Q5_K_M.gguf",
        "n_ctx": 2048,
    },
    prompt_formats=llama_prompt_format,
    unload_on_completion=True
),
    context_aggregator_agent=LLaMaAgent(
    name="context_aggregator_agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/airoboros-mistral2.2-7B-GGUF/airoboros-mistral2.2-7b.Q5_K_M.gguf",
        "n_ctx": 2048,
    },
    prompt_formats=llama_prompt_format,
    unload_on_completion=True
))

print(memgpt_agent.summary())