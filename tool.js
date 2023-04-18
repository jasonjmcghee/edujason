const {createFinalVideo, makeVideo} = require("./page-recorder");

const uniqueFolder = "c2da80a3-bf23-4e7e-a233-8ed7d2f6ba95";

(async() => {
  await makeVideo(`http://localhost:3000/${uniqueFolder}.html`, uniqueFolder);
})();

// (async() => {
//   await createFinalVideo("bdc01d3b-6222-4607-8d1e-523f9c58b5c4", [
//     "bdc01d3b-6222-4607-8d1e-523f9c58b5c4/video-0.mp4",
//     "bdc01d3b-6222-4607-8d1e-523f9c58b5c4/video-2.mp4",
//     "bdc01d3b-6222-4607-8d1e-523f9c58b5c4/video-3.mp4",
//     "bdc01d3b-6222-4607-8d1e-523f9c58b5c4/video-4.mp4",
//     "bdc01d3b-6222-4607-8d1e-523f9c58b5c4/video-5.mp4",
//     "bdc01d3b-6222-4607-8d1e-523f9c58b5c4/video-6.mp4",
//   ]);
// })()

