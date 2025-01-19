import { cookie, setCookie } from "@lazarv/react-server";

export default class Cookies {
  constructor() {
    this.cookieObject = cookie();
  }

  get(name) {
    return { value: this.cookieObject[name] };
  }

  set(name, value, options) {
    this.cookieObject[name] = value;
    setCookie(name, value, options);
  }

  toString() {
    return `Cookies object : ${JSON.stringify(this.cookieObject)}`;
  }
}
