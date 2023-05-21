const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, generateDependencyReport } = require('@discordjs/voice');
const { Client, Intents } = require('discord.js');
const ytdl = require('ytdl-core');
const search = require('youtube-search');
const fetch = require('node-fetch');

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES] });

const audioPlayer = createAudioPlayer();
const queue = [];

const keepAlive = require('./alive.js');
keepAlive();


let isPlaying = false; // Track if a song is currently being played

const runBot = async () => {
  try {
    client.once('ready', async () => {
      console.log('Bot is ready!');
      const dependencies = generateDependencyReport();
      console.log(dependencies);

      // Register slash commands
      try {
        await client.application.commands.set([
          {
            name: 'play',
            description: 'Play a song',
            options: [
              {
                name: 'query',
                description: 'Search query or YouTube URL',
                type: 'STRING',
                required: true,
              },
            ],
          },
          {
            name: 'skip',
            description: 'Skip the current song',
          },
          {
            name: 'queue',
            description: 'Show the current queue',
          },
          {
            name: 'pause',
            description: 'Pause the playback',
          },
          {
            name: 'resume',
            description: 'Resume the playback',
          },
        ]);
        console.log('Slash commands registered successfully!');
      } catch (error) {
        console.error('Failed to register slash commands:', error);
      }
    });

    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isCommand()) return;
      
        const { commandName, options } = interaction;
      
        if (commandName === 'play') {
          const voiceChannel = interaction.member.voice.channel;
          if (!voiceChannel) return interaction.reply('You must be in a voice channel to use this command.');
      
          const permissions = voiceChannel.permissionsFor(interaction.client.user);
          if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
            return interaction.reply('I don\'t have permission to join or speak in your voice channel.');
          }
      
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator
          });
      
          connection.on('error', (error) => {
            console.error(error);
          });
      
          try {
            const searchQuery = options.getString('query');
      
            const searchOptions = {
              maxResults: 1,
              key: 'api key here', // Replace with your YouTube API key
              type: 'video'
            };
      
            search(searchQuery, searchOptions, async (err, results) => {
              if (err) {
                console.error(err);
                return interaction.reply('An error occurred while searching for the video.');
              }
      
              if (results.length === 0) {
                return interaction.reply('No videos found for the search query.');
              }
      
              const videoUrl = results[0].link;
              const videoTitle = results[0].title;
      
              const stream = ytdl(videoUrl, { filter: 'audioonly' });
              const audioResource = createAudioResource(stream);
              queue.push({ resource: audioResource, title: videoTitle });
      
              interaction.reply(`Added to queue: ${videoTitle}`);
      
              if (!isPlaying) {
                playNextInQueue(connection, interaction);
              }
            });
      
          } catch (error) {
            console.error(error);
          }
        } else if (commandName === 'skip') {
          if (queue.length > 0) {
            audioPlayer.stop();
            interaction.reply('Skipped the current song.');
          } else {
            interaction.reply('There are no videos in the queue to skip.');
          }
        } else if (commandName === 'queue') {
          if (queue.length > 0) {
            const queueList = queue.map((item, index) => `${index + 1}. ${item.title}`).join('\n');
            interaction.reply(`Current queue:\n${queueList}`);
          } else {
            interaction.reply('The queue is currently empty.');
          }
        } else if (commandName === 'pause') {
          if (isPlaying) {
            audioPlayer.pause();
            interaction.reply('Playback paused.');
          } else {
            interaction.reply('There is no song currently playing.');
          }
        } else if (commandName === 'resume') {
          if (audioPlayer.state.status === AudioPlayerStatus.Paused) {
            audioPlayer.unpause();
            interaction.reply('Playback resumed.');
          } else {
            interaction.reply('There is no paused song to resume.');
          }
        }
      });

      client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
      
        if (message.content.startsWith('!play')) {
          const voiceChannel = message.member.voice.channel;
          if (!voiceChannel) return message.reply('You must be in a voice channel to use this command.');
      
          const permissions = voiceChannel.permissionsFor(message.client.user);
          if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
            return message.reply('I don\'t have permission to join or speak in your voice channel.');
          }
      
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
          });
      
          connection.on('error', (error) => {
            console.error(error);
          });
      
          try {
            // Get the search query from the message content
            const searchQuery = message.content.slice(6).trim();
      
            // Search for videos on YouTube based on the search query
            const searchOptions = {
              maxResults: 1,
              key: 'api key here', // Replace with your YouTube API key
              type: 'video'
            };
      
            search(searchQuery, searchOptions, async (err, results) => {
              if (err) {
                console.error(err);
                return message.reply('An error occurred while searching for the video.');
              }
      
              if (results.length === 0) {
                return message.reply('No videos found for the search query.');
              }
      
              const videoUrl = results[0].link;
              const videoTitle = results[0].title;
      
              // Fetch the audio stream from YouTube
              const stream = ytdl(videoUrl, { filter: 'audioonly' });
      
              // Create an audio resource from the stream
              const audioResource = createAudioResource(stream);
      
              // Add the audio resource and video title to the queue
              queue.push({ resource: audioResource, title: videoTitle });
      
              // Send a message to the channel with the video title
              message.channel.send(`Added to queue: ${videoTitle}`);
      
              // If no song is currently playing, start playing the next song in the queue
              if (!isPlaying) {
                playNextInQueue(connection, message);
              }
            });
      
          } catch (error) {
            console.error(error);
          }
        } else if (message.content.startsWith('!skip')) {
          if (queue.length > 0) {
            // Stop the current song and play the next song in the queue
            audioPlayer.stop();
            message.channel.send('Skipped the current song.');
          } else {
            message.reply('There are no videos in the queue to skip.');
          }
        } else if (message.content.startsWith('!queue')) {
          if (queue.length > 0) {
            const queueList = queue.map((item, index) => `${index + 1}. ${item.title}`).join('\n');
            message.channel.send(`Current queue:\n${queueList}`);
          } else {
            message.reply('The queue is currently empty.');
          }
        } else if (message.content.startsWith('!pause')) {
          if (isPlaying) {
            audioPlayer.pause();
            message.channel.send('Playback paused.');
          } else {
            message.reply('There is no song currently playing.');
          }
        } else if (message.content.startsWith('!resume')) {
          if (audioPlayer.state.status === AudioPlayerStatus.Paused) {
            audioPlayer.unpause();
            message.channel.send('Playback resumed.');
          } else {
            message.reply('There is no paused song to resume.');
          }
        }
      });

      function playNextInQueue(connection, message) {
        if (queue.length > 0) {
          const { resource, title } = queue[0];
          audioPlayer.play(resource);
          connection.subscribe(audioPlayer);
          isPlaying = true;
      
          message.channel.send(`Now playing: ${title}`);
      
          audioPlayer.on(AudioPlayerStatus.Idle, () => {
            // Remove the completed song from the queue
            queue.shift();
      
            // Play the next song in the queue
            if (queue.length > 0) {
              const { resource, title } = queue[0];
              audioPlayer.play(resource);
              message.channel.send(`Now playing: ${title}`);
            } else {
              // Check if the connection is valid and destroy it
              if (connection && !connection.destroyed) {
                connection.destroy();
              }
              isPlaying = false;
            }
          });
        }
      }

    client.login('token here'); // Replace with your bot token
  } catch (error) {
    console.error('An error occurred:', error);
    console.log('Restarting the bot...');
    await sleep(5000); // Wait for 5 seconds before restarting
    runBot();
  }
};

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

runBot();