import Counter from './Counter';

export default function App() {
  return (
    <html>
      <body>
        <h1>Hello World!</h1>
        <p>My random number for today is {Math.random()}</p>
        <Counter />
      </body>
    </html>
  );
}
