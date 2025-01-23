"use client";

import React, { useState } from "react";

import classes from "./Tabs.module.css";

export function Tabs({ name = "tab", children }) {
  const [selectedTab, setSelectedTab] = useState(0);

  // Convert children to array to get index for ids
  const tabs = React.Children.toArray(children);

  return (
    <div className="flex flex-col w-full">
      <div className="flex mb-2">
        {tabs.map((tab, index) => (
          <div key={index} className={classes.tab}>
            <input
              type="radio"
              name={name}
              id={`tab-${name}-${index}`}
              defaultChecked={index === 0}
              onChange={() => setSelectedTab(index)}
              className="hidden peer"
            />
            <label
              htmlFor={`tab-${name}-${index}`}
              className="flex items-center justify-center gap-2 relative px-2 py-1 border-b-0 border-gray-200 cursor-pointer peer-checked:text-indigo-500 peer-checked:dark:text-yellow-600"
            >
              {tab.props.title}
            </label>
          </div>
        ))}
      </div>
      <div className="w-full">
        {tabs.map((tab, index) => (
          <div
            key={index}
            className={`w-full min-h-20 [&_code]:!my-0 ${selectedTab === index ? "block" : "hidden"}`}
          >
            {tab}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Tab({ children }) {
  return children;
}
