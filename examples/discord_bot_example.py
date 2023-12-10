import os
from comma_agents.agents.base_agent import BaseAgent
from comma_agents.agents.external.llama_cpp_agent import LLaMaAgent
import discord
import asyncio
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv('DISCORD_TOKEN')

intents = discord.Intents.default()
intents.messages = True
intents.guilds = True

client = discord.Client(intents=intents)

zypher_prompt_format: BaseAgent.AgentPromptFormats = {
    "system_message_start_token": "<|system|>\n",
    "system_message_end_token": "\n</s>\n",
    "user_message_start_token": "<|user|>\n",
    "user_message_end_token": "\n</s>\n",
    "assistant_message_start_token": "<|assistant|>\n",
    "assistant_message_end_token": "\n</s>\n"
}


chat_agent = LLaMaAgent(
        name="Discord Chat Agent",
        system_prompt="""
You're a cool and funny chat bot.
You can also do some light insults and passive aggressive comments.
If someone asks you to code get mad at them.
You have a funny random catchphrase at the end of your messages.
""",
        prompt_formats=zypher_prompt_format,
        remember_context=True,
        context_window_size=2,
        llama_config={
            "model_path": "~/.cache/lm-studio/models/TheBloke/zephyr-7B-beta-GGUF/zephyr-7b-beta.Q6_K.gguf",
        }
)

@client.event
async def on_ready():
    print(f'{client.user} has connected to Discord!')
    
@client.event
async def on_message(message):
    print("Message received: " + message.content)
    
    # Don't respond to the bot's own messages
    if message.author == client.user:
        return

    # Check if the message mentions the bot
    if client.user.mentioned_in(message):
        print("Bot got mentioned, generating response...")

        try:
            print("Got message: " + message.content)
            response_message = await asyncio.to_thread(chat_agent.call, message.content)
            print("Bot generated response: " + response_message)
            if response_message is not None or response_message != "":
                await message.channel.send(response_message)
            else:
                await message.channel.send("I'm sorry, I don't know how to respond to that.")
        except Exception as e:
            print(f"Error in generating response: {e}")

client.run(TOKEN)