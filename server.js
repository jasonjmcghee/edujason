const express = require('express');
const {readFileSync, statSync, createReadStream, writeFileSync, mkdir} = require("fs");
const {makeVideo} = require("./page-recorder");
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();

app.use(cors({
  origin: "https://chat.openai.com"
}));

app.use(bodyParser.json());

const port = 3000;

const useCode = false;

const slideContentPrompt = (subject) => `You are helping build a short educational video which provides "${subject}" which is less than 3 minutes long. POST to /video-script-prompt with JSON of 5-10 slides in markdown format with a short title, and optionally subheading${useCode ? ", code (tagged with the language, separated by a blank line)," : ""} or supporting bullet points. One element in the array is an entire slide. Do not output it to the chat.`;

const scriptPrompt = `POST to /make-video with the video script, split into an array of script-portions for each slide. Incorporate dry satirical humor - don't recycle jokes. Use creative metaphors (not too many, do not use "like"), use casual speech, and be friendly. Start and end in unique ways. Spell out any symbols. Mention any uncertainty with material presented. Remember the audience will have the slides from before.  Do not output it to the chat.`;

let uniqueFolder = "";
let slideContent = [];

/** This must be called first to generate the prompt necessary for creating initial slides for learning. */
app.post("/slide-content-prompt", (req, res) => {
  const jsonData = req.body;
  const subject = jsonData["subject"];
  uniqueFolder = uuidv4();
  mkdir(uniqueFolder, (err) => {
    if (err) {
      console.error(err);
    }
  });
  res.send({
    "prompt": slideContentPrompt(subject)
  })
});

/** Call this next to ensure the content is stored and the video script prompt is retrieved. */
app.post("/video-script-prompt", (req, res) => {
  const jsonData = req.body;
  slideContent = jsonData["slides"];
  res.send({"prompt": scriptPrompt})
});

/** Finally, call this to create the video for our audience. */
app.post('/make-video', async (req, res) => {
  const jsonData = req.body;
  jsonData["slides"].forEach((s, i) => {
    slideContent[i] = (slideContent[i] || "") + `\nNote:\n\n${s}`;
  });
  const sample = slideContent.join("\n\n---\n\n");
  writeFileSync(`${uniqueFolder}/presentation.md`, sample, 'utf8');
  const page = readFileSync('public/index.html', 'utf-8').replace('{replace_me}', sample);
  writeFileSync(`public/${uniqueFolder}.html`, page, 'utf8');
  await makeVideo(`http://localhost:3000/${uniqueFolder}.html`, uniqueFolder);
  res.send({"link": `http://localhost:3000/watch/${uniqueFolder}`});
});

app.use(express.static('public'));

app.get('/watch/:folder', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
  <head>
    <style>
    body { margin: 0; background-color: #191919 }; 
    </style>
    <title>Video Player</title>
  </head>
  <body>
    <video controls style="width: 100%; height: auto">
      <source src="http://localhost:3000/video/${req.params["folder"]}" type="video/mp4">
    </video>
  </body>
</html>`);
});


app.get('/video/:folder', (req, res) => {
  const range = req.headers.range;
  if (!range) {
    res.status(400).send('Range header not found');
    return;
  }

  const videoPath = `${req.params["folder"]}/final-video.mp4`;
  const stats = statSync(videoPath);
  const videoSize = stats.size;

  const parts = range.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : videoSize - 1;

  const chunkSize = (end - start) + 1;
  const fileStream = createReadStream(videoPath, { start, end });

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${videoSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': 'video/mp4',
  });

  fileStream.pipe(res);
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});