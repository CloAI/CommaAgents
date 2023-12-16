import os
from comma_agents.agents.base_agent import BaseAgent
from comma_agents.agents.external.llama_cpp_agent import LLaMaAgent
import discord
import asyncio
import queue
from dotenv import load_dotenv
from comma_agents.prompts import PromptTemplate, ZephyrPromptTemplate, LLaMaPromptTemplate

from comma_agents.strategies.memory_strategy.memory_strategy import MemoryStrategy

load_dotenv()
TOKEN = os.getenv('DISCORD_TOKEN')

intents = discord.Intents.all()
client = discord.Client(intents=intents)

memgpt_agent = MemoryStrategy(
    memory_processor_agent=LLaMaAgent(
    name="memory_processor_agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/airoboros-mistral2.2-7B-GGUF/airoboros-mistral2.2-7b.Q5_K_M.gguf",
        "n_ctx": 2048,
    },
    prompt_template=LLaMaPromptTemplate(),
    unload_on_completion=True
),
    question_extractor_agent=LLaMaAgent(
    name="question_extractor_agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/airoboros-mistral2.2-7B-GGUF/airoboros-mistral2.2-7b.Q5_K_M.gguf",
        "n_ctx": 2048,
    },
    prompt_template=LLaMaPromptTemplate(),
    unload_on_completion=True
),
    statement_extractor_agent=LLaMaAgent(
    name="statement_extractor_agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/airoboros-mistral2.2-7B-GGUF/airoboros-mistral2.2-7b.Q5_K_M.gguf",
        "n_ctx": 2048,
    },
    prompt_template=LLaMaPromptTemplate(),
    unload_on_completion=True
),
    context_aggregator_agent=LLaMaAgent(
    name="context_aggregator_agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/airoboros-mistral2.2-7B-GGUF/airoboros-mistral2.2-7b.Q5_K_M.gguf",
        "n_ctx": 2048,
    },
    prompt_template=LLaMaPromptTemplate(),
    unload_on_completion=True
))

chat_agent = LLaMaAgent(
        name="Discord Chat Agent",
        system_prompt="""
- You are a chat bot.
- Your name is "Echo".
- You're a cool and funny chat bot.
- You are given some context for a prompt base on relevant information.
- Ignore details that might not be useful.
- You can also do some light insults and passive aggressive comments.
- If someone asks you to code get mad at them.
- You have a funny random catchphrase at the end of your messages.
- Don't mention that you're missing context for a prompt, just respond with something you think is helpful or funny.
""",
        prompt_template=ZephyrPromptTemplate(),
        remember_context=True,
        context_window_size=2,
        llama_config={
            "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/zephyr-7B-beta-GGUF/zephyr-7b-beta.Q6_K.gguf",
            "n_ctx": 2048*4,
        }
)

message_queue = queue.Queue()

@client.event
async def on_ready():
    print(f'{client.user} has connected to Discord!')

@client.event
async def on_message(message):
    print(f"{message.author.name} said: {message.clean_content}")
    message_queue.put(message)

async def chat_thread_call(message):
    mem_response = await client.loop.run_in_executor(None, memgpt_agent.run_strategy, message)
    chat_response = await client.loop.run_in_executor(None, chat_agent.call, f"""
CONTEXT, {mem_response}
Prompt, {message}
""")
    return chat_response

async def process_message_queue():
    while True:
        message = await client.loop.run_in_executor(None, message_queue.get)
        message_cleaned = "{name} said, {message}".format(name=message.author.name, message=message.clean_content)

        if message.author == client.user:
            await client.loop.run_in_executor(None, memgpt_agent.run_strategy, message_cleaned)
            continue

        if client.user.mentioned_in(message):
            try:
                response_message = await chat_thread_call(message_cleaned)
                if response_message:
                    await message.channel.send(response_message)
                else:
                    await message.channel.send("I'm sorry, I don't know how to respond to that.")
            except Exception as e:
                print(f"Error in generating response: {e}")
        else:
            await client.loop.run_in_executor(None, memgpt_agent.run_strategy, message_cleaned)

async def setup_hook():
    client.loop.create_task(process_message_queue())

client.setup_hook = setup_hook
client.run(TOKEN)