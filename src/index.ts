import { Command, flags } from '@oclif/command';
import { cli } from 'cli-ux';
import xmlParser from 'fast-xml-parser';
import { emptyDir, ensureDir, pathExists, readFile, move, writeFile } from 'fs-extra';
import he from 'he';
import { basename, resolve } from 'path';
import xmlBuilder from 'xmlbuilder';
import { DownloadManager } from './DownloadManager';

class BbbDl extends Command {
	static description = 'Download a Big Blue Button meeting.';

	static flags = {
		help: flags.help({
			char:        'h',
			description: 'Show CLI help',
		}),

		outdir: flags.string({
			char:        'd',
			description: 'Specify output directory',
		}),
	};

	static args = [
		{
			name:        'url',
			description: 'Playback URL of a Big Blue Button meeting in the form of https://<website>/playback/presentation/2.3/<meeting-id>',
			required:    true,
		},
	];

	async run() {
		const { args, flags } = this.parse(BbbDl);
		const { url } = args;

		this.log('Started downloader!');

		/*
		const slide1Producer = xml.element('producer', { id: 'slide1' });
		slide1Producer.element('property', { name: 'resource' }, 'slides/slide-1.png');
		slide1Producer.element('property', { name: 'mlt_service' }, 'qimage');
		slide1Producer.element('property', { name: 'ttl' }, '1');

		const slidesPlaylist = xml.element('playlist', { id: 'slides' });
		slidesPlaylist.element('property', { name: 'shotcut:video' }, '1');
		slidesPlaylist.element('property', { name: 'shotcut:name' }, 'Slides');
		slidesPlaylist.element('blank', { length: this.formatTimestamp(1125) });
		slidesPlaylist.element('entry', { producer: 'slide1', in: this.formatTimestamp(0), out: this.formatTimestamp(11375) });
		 */

		const matchResult = (/^(?<baseUrl>https?:\/\/.*)\/playback\/presentation\/2\.3\/(?<meetingId>[a-z0-9]{40}-[0-9]{13})/i).exec(url);

		if (!matchResult || !matchResult.groups?.baseUrl || !matchResult.groups?.meetingId) {
			this.error('Invalid URL or unsupported version!');
		}

		const { baseUrl, meetingId } = matchResult.groups;

		const prefixUrl = `${baseUrl}/presentation/${meetingId}`;

		let specifiedOutDir = !!flags.outdir;
		const downloadFolder = specifiedOutDir ? `./${flags.outdir}` : `./${meetingId}`;
		const dataDownloadFolder = resolve(downloadFolder, 'data');
		const videosDownloadFolder = resolve(downloadFolder, 'videos');
		const slidesDownloadFolder = resolve(downloadFolder, 'slides');
		const textFilesDownloadFolder = resolve(downloadFolder, 'textfiles');

		cli.action.start('Setting up folder structure');
		await emptyDir(downloadFolder);
		await ensureDir(dataDownloadFolder);
		await ensureDir(videosDownloadFolder);
		await ensureDir(slidesDownloadFolder);
		await ensureDir(textFilesDownloadFolder);
		cli.action.stop();

		this.log('Downloading files...');

		const downloadManager = new DownloadManager({
			fileConflictMode: DownloadManager.FileConflictMode.OVERWRITE,
		});

		downloadManager.setDownloadFolder(dataDownloadFolder);

		await downloadManager.downloadAll([
			`${prefixUrl}/presentation_text.json`,
			`${prefixUrl}/captions.json`,
			`${prefixUrl}/slides_new.xml`,
			`${prefixUrl}/cursor.xml`,
			`${prefixUrl}/metadata.xml`,
			`${prefixUrl}/panzooms.xml`,
			`${prefixUrl}/deskshare.xml`,
			`${prefixUrl}/notes.html`,
			`${prefixUrl}/polls.json`,
			`${prefixUrl}/external_videos.json`,
			`${prefixUrl}/shapes.svg`,
		]);

		downloadManager.setDownloadFolder(videosDownloadFolder);

		await downloadManager.downloadAll([
			`${prefixUrl}/video/webcams.webm`,
			`${prefixUrl}/video/webcams.mp4`,
			`${prefixUrl}/deskshare/deskshare.webm`,
		]);

		let slides: BbbDl.Slide[] = [];
		const shapesFile = resolve(dataDownloadFolder, 'shapes.svg');
		if (await pathExists(shapesFile)) {
			const shapesData = await this.readXml(shapesFile);

			let slideImages: string[] = [];
			let slideTextFiles: string[] = [];
			if (shapesData.svg?.image) {
				for (let image of shapesData.svg.image) {
					const filename = basename(image.href);
					if (filename === 'deskshare.png') continue;

					const imageUrl = `${prefixUrl}/${image.href}`;
					const textFileUrl = `${prefixUrl}/${image.text}`;

					if (image.href && !slideImages.includes(imageUrl)) slideImages.push(imageUrl);
					if (image.text && !slideTextFiles.includes(textFileUrl)) slideTextFiles.push(textFileUrl);

					const id = filename.substr(0, filename.lastIndexOf('.'));
					slides.push({
						id,
						file:   `slides/${filename}`,
						in:     image.in * 1000,
						out:    image.out * 1000,
						width:  +image.width,
						height: +image.height,
					});
				}
			}

			downloadManager.setDownloadFolder(slidesDownloadFolder);
			await downloadManager.downloadAll(slideImages);

			downloadManager.setDownloadFolder(textFilesDownloadFolder);
			await downloadManager.downloadAll(slideTextFiles);
		}

		cli.action.start('Creating MLT file');

		const metadataFile = resolve(dataDownloadFolder, 'metadata.xml');
		if (!await pathExists(shapesFile)) this.error('Unable to create MLT file: File "data/metadata.xml" not found!');

		const metadata = await this.readXml(metadataFile);

		const duration = metadata.recording?.playback?.duration;
		if (!duration) this.error('Unable to create MLT file: Can\'t determine playback duration!');

		const meetingName =
			metadata.recording?.meeting?.name ??
			metadata.recording?.meta?.meetingName ??
			metadata.recording?.meta['bbb-recording-name'] ??
			meetingId;


		const xml = xmlBuilder.create('mlt', {
			version:    '1.0',
			standalone: false,
		});

		let tracks: string[] = [];


		if (await pathExists(resolve(videosDownloadFolder, 'deskshare.webm'))) {
			const deskShareProducer = xml.element('producer', { id: 'deskshare' });
			deskShareProducer.element('property', { name: 'resource' }, 'videos/deskshare.webm');
			deskShareProducer.element('property', { name: 'audio_index' }, '-1');
			deskShareProducer.element('property', { name: 'video_index' }, '0');
			deskShareProducer.element('property', { name: 'mlt_service' }, 'avformat');
			deskShareProducer.element('property', { name: 'mute_on_pause' }, '0');
			deskShareProducer.element('property', { name: 'seekable' }, '1');

			const deskSharePlaylist = xml.element('playlist', { id: 'deskshare_video' });
			deskSharePlaylist.element('property', { name: 'shotcut:video' }, '1');
			deskSharePlaylist.element('property', { name: 'shotcut:name' }, 'Deskshare');
			deskSharePlaylist.element('entry', {
				producer: 'deskshare',
				in:       this.formatTimestamp(0),
				out:      this.formatTimestamp(duration),
			});

			tracks.push('deskshare_video');
		}


		let webcamVideoFile = 'webcams.webm';
		if (!await pathExists(resolve(videosDownloadFolder, webcamVideoFile))) {
			webcamVideoFile = 'webcams.mp4';

			if (!await pathExists(resolve(videosDownloadFolder, webcamVideoFile))) {
				this.error('Unable to create MLT file: File "videos/webcams.webm" not found!');
			}
		}

		const webcamProducer = xml.element('producer', { id: 'webcam' });
		webcamProducer.element('property', { name: 'resource' }, `videos/${webcamVideoFile}`);
		webcamProducer.element('property', { name: 'audio_index' }, '1');
		webcamProducer.element('property', { name: 'video_index' }, '-1');
		webcamProducer.element('property', { name: 'mlt_service' }, 'avformat');
		webcamProducer.element('property', { name: 'mute_on_pause' }, '0');
		webcamProducer.element('property', { name: 'seekable' }, '1');

		const webcamAudioPlaylist = xml.element('playlist', { id: 'webcam_audio' });
		webcamAudioPlaylist.element('property', { name: 'shotcut:audio' }, '1');
		webcamAudioPlaylist.element('property', { name: 'shotcut:name' }, 'Webcam Audio');
		webcamAudioPlaylist.element('entry', {
			producer: 'webcam',
			in:       this.formatTimestamp(0),
			out:      this.formatTimestamp(duration),
		});

		tracks.push('webcam_audio');


		if (slides.length > 0) {
			for (let slide of slides) {
				const slideProducer = xml.element('producer', { id: slide.id });
				slideProducer.element('property', { name: 'resource' }, slide.file);
				slideProducer.element('property', { name: 'mlt_service' }, 'qimage');
				slideProducer.element('property', { name: 'ttl' }, '1');
			}

			const slidesPlaylist = xml.element('playlist', { id: 'slides' });
			slidesPlaylist.element('property', { name: 'shotcut:video' }, '1');
			slidesPlaylist.element('property', { name: 'shotcut:name' }, 'Slides');

			let lastTimestamp = 0;
			for (let slide of slides) {
				if (slide.in - lastTimestamp !== 0) {
					slidesPlaylist.element('blank', {
						length: this.formatTimestamp(slide.in - lastTimestamp),
					});
				}

				slidesPlaylist.element('entry', {
					producer: slide.id,
					in:       this.formatTimestamp(0),
					out:      this.formatTimestamp(slide.out - slide.in),
				});

				lastTimestamp = slide.out;
			}

			tracks.push('slides');
		}


		const mainTractor = xml.element('tractor', { id: 'main_tractor' });
		mainTractor.element('property', { name: 'shotcut' }, '1');

		for (let producer of tracks) {
			mainTractor.element('track', { producer });
		}

		const xmlStr = xml.end({ pretty: true });
		const mltFile = resolve(downloadFolder, `${meetingName}.mlt`);

		try {
			await writeFile(mltFile, xmlStr);
		} catch (e) {
			this.warn(e);
			this.error('Unable to create MLT file!');
		}

		cli.action.stop();

		if (!specifiedOutDir) {
			cli.action.start('Renaming output directory');
			try {
				await move(downloadFolder, `./${meetingName}`);
			} catch (e) {
				this.warn(e);
				this.error('Unable to rename output directory!');
			}
			cli.action.stop();
		}
	}

	protected async readXml(file: string): Promise<any> {
		try {
			const rawXml = await readFile(file, 'utf8');

			return this.parseXml(rawXml);
		} catch (e) {
			this.warn(e);
			this.error('Error while reading file: ' + file);
		}
	}

	protected parseXml(xml: string): any {
		return xmlParser.parse(xml, {
			attributeNamePrefix:    '',
			ignoreAttributes:       false,
			ignoreNameSpace:        true,
			allowBooleanAttributes: false,
			parseNodeValue:         true,
			parseAttributeValue:    true,
			trimValues:             true,
			parseTrueNumberOnly:    true,
			arrayMode:              tagName => [ 'image' ].includes(tagName),
			attrValueProcessor:     value => he.decode(value, { isAttributeValue: true }),
			tagValueProcessor:      value => he.decode(value),
		});
	}

	/**
	 * Format a timestamp for MLT
	 * @param timestamp - Timestamp in milliseconds
	 */
	protected formatTimestamp(timestamp: number): string {
		return new Date(timestamp).toISOString().substr(11, 12);
	}

}

namespace BbbDl {

	export interface Slide {
		id: string;
		file: string;
		in: number;
		out: number;
		width: number;
		height: number;
	}

}

export = BbbDl
