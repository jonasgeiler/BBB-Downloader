> **PLEASE NOTE:** I've made this tool for my personal needs, so don't expect elaborate documentation or good written code. 

BBB-Downloader
==============

Super simple downloader for Big Blue Button Meetings.  
Downloads all files and creates a simple [MLT file](https://www.mltframework.org/docs/mltxml/), which can be imported into [Shotcut](https://shotcut.org). 

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/bbb-dl.svg)](https://npmjs.org/package/bbb-dl)
[![Downloads/week](https://img.shields.io/npm/dw/bbb-dl.svg)](https://npmjs.org/package/bbb-dl)
[![License](https://img.shields.io/npm/l/bbb-dl.svg)](https://github.com/Skayo/BBB-Downloader/blob/master/package.json)

## Usage

```sh-session
Install:
$ npm install -g bbb-dl
or:
$ npx bbb-dl [...]

Download meeting:
$ bbb-dl https://example.com/playback/presentation/2.3/123nb123jd901k2e2nc8j21k-12312322

Specify output dir:
$ bbb-dl https://example.com/playback/presentation/2.3/123nb123jd901k2e2nc8j21k-12312322 -d OutputDir

Help:
$ bbb-dl -h

Version:
$ bbb-dl -v
```

## Exporting to a single video file

In the download folder you'll find a file ending with `.mlt`.  
This is an [Media Lovin' Toolkit XML file](https://www.mltframework.org/docs/mltxml/) which can be imported to [Shotcut](https://shotcut.org).  
Just open Shotcut, press "Open File", and double click on the `.mlt` file.  
Now you can export the whole meeting with slides, audio and desktop share as a single video file.
