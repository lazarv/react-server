import { isCustomAttribute, possibleStandardNames } from "react-property";

import styleToJs from "style-to-js";

export default function visit(node, context) {
  switch (node.nodeName) {
    case "#document-fragment":
      return node.childNodes.map((node) => visit(node, context));
    case "#text":
      return node.value;
    case "#comment":
      return null;
    default: {
      if (node.nodeName === "template" && context.defer) {
        return null;
      }
      const childNodes =
        node.childNodes?.map((node) => visit(node, context)) ?? [];
      const children = childNodes.length > 1 ? childNodes : childNodes[0];
      const props =
        node.attrs?.reduce((props, attr) => {
          if (
            node.attrs.find(
              (attr) => attr.name === "type" && attr.value === "hidden"
            ) &&
            attr.name === "name" &&
            attr.value.startsWith("$ACTION_ID_")
          ) {
            props.name = "remote:" + attr.value;
            return props;
          }
          if (
            node.nodeName === "form" &&
            attr.name === "action" &&
            attr.value === ""
          ) {
            props.action = context.origin;
            return props;
          }
          if (attr.name === "style") {
            props.style = styleToJs(attr.value, {
              reactCompat: true,
            });
            return props;
          }
          if (node.nodeName === "input" && attr.name === "value") {
            props.defaultValue = attr.value;
            return props;
          }
          if (isCustomAttribute(attr.name)) {
            props[attr.name] = attr.value;
            return props;
          }
          props[possibleStandardNames[attr.name] ?? attr.name] = attr.value;
          return props;
        }, {}) ?? {};
      if (typeof children !== "undefined") {
        props.children =
          node.nodeName === "script" && children.startsWith("$")
            ? `$${children}`
            : children;
      }
      return ["$", node.nodeName, null, props, null, null, 1];
    }
  }
}
