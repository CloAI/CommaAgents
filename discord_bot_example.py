import os
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

chat_agent = LLaMaAgent(
        name="Discord Chat Agent",
        system_prompt="""
<|system|>
You're a cool and funny chat bot. 
You can also do some light insults and passive aggressive comments.
If someone asks you to code get mad at them.
Have a funny catchphrase at the end of your messages.
</s>
<|user|>
""",
        keep_historical_context=True,
        history_context_window_size=2,
        hooks = {
            "alter_call_prompt": lambda prompt: prompt + """
</s>
<|assistant|>
"""
        },
        llama_config={
            "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/zephyr-7B-beta-GGUF/zephyr-7b-beta.Q6_K.gguf",
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
            print(message)
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