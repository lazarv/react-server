export default function RandomError({ threshold = 0.5 }) {
  if (Math.random() > threshold) throw new Error("Error!");
}
