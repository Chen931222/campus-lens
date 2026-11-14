// Demo site: the lens is built into the page so anyone can try it without installing anything.
// ?plain=1 shows the bare school page, to try the extension on it instead.
import { mount } from "./main";
if (new URLSearchParams(location.search).get("plain") !== "1") mount();
