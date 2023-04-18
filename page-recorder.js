const puppeteer = require('puppeteer');
const { spawn, exec } = require('node:child_process');
const {writeFileSync, createWriteStream, existsSync} = require("fs");
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
require('dotenv').config();

function spawnFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);

    ffmpeg.stdout.on('data', data => {
      console.log(`stdout: ${data}`);
    });

    ffmpeg.stderr.on('data', data => {
      console.error(`stderr: ${data}`);
    });

    ffmpeg.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

async function addBackgroundAudio(videoFile, backgroundAudioFile, volume, outputFile) {
  try {
    const args = [
      '-y',
      '-i', videoFile,
      '-i', backgroundAudioFile,
      '-filter_complex', `[1:a]volume=${volume}[bg];[0:a][bg]amix=inputs=2:duration=first[a]`,
      '-map', '0:v',
      '-map', '[a]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      outputFile
    ];
    await spawnFfmpeg(args);
    console.log('Background audio added successfully.');
  } catch (error) {
    console.error(`Error while adding background audio: ${error.message}`);
  }
}


async function concatenateVideos(videos, outputFile, folder) {
  const videosToConcat = `videos-to-concat.txt`;
  const content = videos.map(video => `file '${video}'`).join('\n');
  writeFileSync(videosToConcat, content, 'utf8');

  try {
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', videosToConcat, '-c', 'copy', outputFile];
    await spawnFfmpeg(args);
    console.log('Videos concatenated successfully.');
  } catch (error) {
    console.error(`Error while concatenating videos: ${error.message}`);
  }
}

const elevenLabsAPI = async (apiKey, text, voice_id, file_name) => {
  try {
    const voiceUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream`;
    const response = await axios({
      method: 'post',
      url: voiceUrl,
      data: { text },
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      responseType: 'stream'
    });

    await new Promise((resolve, reject) => {
      const writeStream = createWriteStream(file_name);
      response.data.pipe(writeStream);
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });
  } catch (error) {
    console.error(error);
  }
};

async function text_to_mp3(text, filename) {
  const antoni_voice_id = "ErXwobaYiN019PkySvjV";
  console.log("Calling ElevenLabsAPI");
  return await elevenLabsAPI(process.env.ELEVEN_LABS_API, text, antoni_voice_id, filename);
}

function text_to_mp3_fallback(text, filename) {
  return new Promise((resolve, reject) => {
    exec(`say "${text}" -o "${filename}.aiff" && sox "${filename}.aiff" "${filename}.mp3" && rm "${filename}.aiff"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error while executing ffmpeg command: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      console.log(`stdout: ${stdout}`);
      resolve();
    })
  });
}

async function getAudioDuration(audioFile) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioFile]);

    let duration = '';

    ffprobe.stdout.on('data', data => {
      duration += data;
    });

    ffprobe.stderr.on('data', data => {
      console.error(`stderr: ${data}`);
    });

    ffprobe.on('close', code => {
      if (code === 0) {
        resolve(parseFloat(duration.trim()));
      } else {
        reject(new Error(`ffprobe exited with code ${code}`));
      }
    });
  });
}

async function generateVideoWithAudioAndImage(audioFile, imageFile, outputFile, isLast = false) {
  return new Promise(async (resolve, reject) => {
    // Construct the ffmpeg command
    // const ffmpegCommand = `ffmpeg -loop 1 -i "${imageFile}" -i "${audioFile}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest "${outputFile}"`;
    const audioDuration = await getAudioDuration(audioFile);
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-loop', '1',
      '-i', `${imageFile}`,
      '-i', `${audioFile}`,
      '-c:v', 'libx264',
      '-tune', 'stillimage',
      '-t', (isLast ? audioDuration + 2 : audioDuration).toString(),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-pix_fmt', 'yuv420p',
      '-shortest',
      // '-preset', 'ultrafast',
      // '-crf', '18',
      outputFile,
    ], {stdio: ['pipe', 'inherit', 'inherit']});

    ffmpeg.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

async function createFinalVideo(folder, videoFilenames) {
  const concatenatedVideo = `${folder}/concatenated_video.mp4`;
  await concatenateVideos(videoFilenames, concatenatedVideo, folder);

  const backgroundAudioFiles = [
    'Falaal.mp3', 'Heliotrope.mp3', 'Leatherbound.mp3', 'Lovers-Hollow.mp3', 'lakeside-path.mp3'
  ];
  const backgroundAudioFile = backgroundAudioFiles[Math.floor(Math.random() * backgroundAudioFiles.length)];
  writeFileSync(`${folder}/music.txt`, backgroundAudioFile, 'utf8');
  // const backgroundAudioFile = 'lakeside-path.mp3';
  const volume = '0.1'; // Adjust the background audio volume (0.1 = 10% of original volume)
  const outputWithBackgroundAudio = `${folder}/final-video.mp4`;

  await addBackgroundAudio(concatenatedVideo, backgroundAudioFile, volume, outputWithBackgroundAudio);
}

const makeVideo = (url, folder) => {
  return new Promise(async (resolve, reject) => {
    const width = 1920;
    const height = 1080;

    const browser = await puppeteer.launch({headless: true, defaultViewport: {width, height}, args: [`--window-size=${width},${height + 120}`]});
    const page = (await browser.pages())[0];

    const data = { images: [], videos: [], audio: [], scripts: [] };

    page.on('console', (message) => {
      if (message.type() === 'log') {
        console.log(`Console log: ${message.text()}`);
      } else if (message.type() === 'error') {
        console.error(`Console error: ${message.text()}`);
      }
    });

    page.exposeFunction("slideschanged", async (script) => {
      const path = `${folder}/image-${data.images.length}.png`;
      data.images.push(path);
      data.scripts.push(script);
      await page.screenshot({type: 'png', path: path});
      // ffmpeg.stdin.write(screenshot);
    })

    page.exposeFunction('slidesdone', async () => {
      await browser.close();

      // Do this sequentially because eleven labs didn't like it.
      // await Promise.all(
        for (const image of data.images) {
          const i = data.images.indexOf(image);
          const audio_filename = `${folder}/audio-${i}.mp3`;
          data.audio.push(audio_filename);
          if (existsSync(audio_filename)) {
            continue;
          }
          await text_to_mp3(data.scripts[i], audio_filename);
        }
      // );

      await Promise.all(
        data.images.map((image, i) => {
          const audio_filename = `${folder}/audio-${i}.mp3`;
          const video_filename = `${folder}/video-${data.videos.length}.mp4`;
          data.videos.push(video_filename);
          return generateVideoWithAudioAndImage(audio_filename, image, video_filename, i === data.images.length - 1);
        })
      );

      await createFinalVideo(folder, data.videos);
      resolve();
    });

    await page.goto(url, { waitUntil: 'load' });
  });
};

module.exports = { makeVideo, getAudioDuration, addBackgroundAudio, createFinalVideo }