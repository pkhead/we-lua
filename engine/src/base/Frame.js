/*
 * Copyright 2020 WICKLETS LLC
 *
 * This file is part of Wick Engine.
 *
 * Wick Engine is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Wick Engine is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Wick Engine.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * A class representing a frame.
 */
Lua.onready(() => {
    luaExtendClass(window.globalLua, "Tickable", "Frame", {
        __index(L) {
            var self = L.checkUserdata(1, "Frame");
            
            if (!self) return 0;

            var index = L.getString(2);
            var frame = window.project.getObjectByUUID(self.uuid);

            switch (index) {
                case "currentFrameName":
                    L.pushString(frame.currentFrameName);
                    break;
                case "currentFrameNumber":
                    L.pushInt(frame.currentFrameNumber);
                    break;
                default:
                    console.log("frame." + index);
                    luaMetafield(L, 1, index);
                    break;
            }

            return 1;
        }
    })
})
Wick.Frame = class extends Wick.Tickable {
    /**
     * Create a new frame.
     * @param {number} start - The start of the frame. Optional, defaults to 1.
     * @param {number} end - The end of the frame. Optional, defaults to be the same as start.
     */
    constructor(args) {
        if (!args) args = {};
        super(args);

        this.start = args.start || 1;
        this.end = args.end || this.start;

        this._soundAssetUUID = null;
        this._soundID = null;
        this._soundVolume = 1.0;
        this._soundLoop = false;
        this._soundStart = 0;

        this._originalLayerIndex = -1;
    }

    _serialize(args) {
        var data = super._serialize(args);

        data.start = this.start;
        data.end = this.end;

        data.sound = this._soundAssetUUID;
        data.soundVolume = this._soundVolume;
        data.soundLoop = this._soundLoop;
        data.soundStart = this._soundStart;

        data.originalLayerIndex = this.layerIndex !== -1 ? this.layerIndex : this._originalLayerIndex;

        return data;
    }

    _deserialize(data) {
        super._deserialize(data);

        this.start = data.start;
        this.end = data.end;

        this._soundAssetUUID = data.sound;
        this._soundVolume = data.soundVolume === undefined ? 1.0 : data.soundVolume;
        this._soundLoop = data.soundLoop === undefined ? false : data.soundLoop;
        this._soundStart = data.soundStart === undefined ? 0 : data.soundStart;

        this._originalLayerIndex = data.originalLayerIndex;
    }

    get classname() {
        return 'Frame';
    }

    /**
     * The length of the frame.
     * @type {number}
     */
    get length() {
        return this.end - this.start + 1;
    }

    set length(length) {
        length = Math.max(1, length);
        var diff = length - this.length;
        this.end += diff;
    }

    /**
     * The midpoint of the frame.
     * @type {number}
     */
    get midpoint() {
        return this.start + (this.end - this.start) / 2;
    }

    /**
     * Is true if the frame is currently visible.
     * @type {boolean}
     */
    get onScreen() {
        if (!this.parent) return true;
        return this.inPosition(this.parentTimeline.playheadPosition) && this.parentClip.onScreen;
    }

    /**
     * The sound attached to the frame.
     * @type {Wick.SoundAsset}
     */
    get sound() {
        var uuid = this._soundAssetUUID;
        return uuid ? this.project.getAssetByUUID(uuid) : null;
    }

    set sound(soundAsset) {
        if (!soundAsset) { 
            this.removeSound();
            return;
        }

        this._soundAssetUUID = soundAsset.uuid;
    }

    /**
     * The volume of the sound attached to the frame.
     * @type {number}
     */
    get soundVolume() {
        return this._soundVolume
    }

    set soundVolume(soundVolume) {
        this._soundVolume = soundVolume;
    }

    /**
     * Whether or not the sound loops.
     * @type {boolean}
     */
    get soundLoop() {
        return this._soundLoop;
    }

    set soundLoop(soundLoop) {
        this._soundLoop = soundLoop;
    }

    /**
     * True if this frame should currently be onion skinned.
     */
    get onionSkinned () {
        if (!this.project || !this.project.onionSkinEnabled) {
            return false;
        }

        // Don't onion skin if we're in the playhead's position.
        var playheadPosition = this.project.focus.timeline.playheadPosition;
        if (this.inPosition(playheadPosition)) {
            return false;
        }

        // Determine if we're in onion skinning range.
        var onionSkinSeekBackwards = this.project.onionSkinSeekBackwards;
        var onionSkinSeekForwards = this.project.onionSkinSeekForwards;
        return this.inRange(playheadPosition - onionSkinSeekBackwards,
                            playheadPosition + onionSkinSeekForwards);

    }

    /**
     * Removes the sound attached to this frame.
     */
    removeSound() {
        this._soundAssetUUID = null;
    }

    /**
     * Plays the sound attached to this frame.
     */
    playSound() {
        if (!this.sound) {
            return;
        }

        var options = {
            seekMS: this.playheadSoundOffsetMS + this.soundStart,
            volume: this.soundVolume,
            loop: this.soundLoop,
            frame: this,
        };

        this._soundID = this.project.playSoundFromAsset(this.sound, options);
    }

    /**
     * Stops the sound attached to this frame.
     */
    stopSound() {
        if (this.sound) {
            this.sound.stop(this._soundID);
            this._soundID = null;
        }
    }

    /**
     * Check if the sound on this frame is playing.
     * @returns {boolean} true if the sound is playing
     */
    isSoundPlaying() {
        return this._soundID !== null;
    }

    /**
     * The amount of time, in milliseconds, that the frame's sound should play before stopping.
     * @type {number}
     */
    get playheadSoundOffsetMS() {
        var offsetFrames = this.parentTimeline.playheadPosition - this.start;
        var offsetMS = (1000 / this.project.framerate) * offsetFrames;
        return offsetMS;
    }

    /**
     * The amount of time the sound playing should be offset, in milliseconds. If this is 0,
     * the sound plays normally. A negative value means the sound should start at a later point
     * in the track. THIS DOES NOT DETERMINE WHEN A SOUND PLAYS.
     * @type {number}
     */
    get soundStart() {
        return this._soundStart;
    }

    set soundStart(val) {
        this._soundStart = val;
    }

    /**
     * When should the sound start, in milliseconds.
     * @type {number}
     */
    get soundStartMS() {
        return (1000 / this.project.framerate) * (this.start - 1);
    }

    /**
     * When should the sound end, in milliseconds.
     * @type {number}
     */
    get soundEndMS() {
        return (1000 / this.project.framerate) * this.end;
    }

    /**
     * Returns the frame's start position in relation to the root timeline.
     */
    get projectFrameStart () {
        if (this.parentClip.isRoot) {
            return this.start;
        } else {
            let val = this.start + this.parentClip.parentFrame.projectFrameStart - 1;
            return val;
        }
    }

    /**
     * The paths on the frame.
     * @type {Wick.Path[]}
     */
    get paths() {
        return this.getChildren('Path');
    }

    /**
     * The paths that are text and have identifiers, for dynamic text.
     * @type {Wick.Path[]}
     */
    get dynamicTextPaths() {
        return this.paths.filter(path => {
            return path.isDynamicText;
        });
    }

    /**
     * The clips on the frame.
     * @type {Wick.Clip[]}
     */
    get clips() {
        return this.getChildren(['Clip', 'Button']);
    }

    /**
     * The drawable objectson the frame.
     * @type {Wick.Base[]}
     */
    get drawable() {
        return this.getChildren(['Clip', 'Button', 'Path']);
    }

    /**
     * The tweens on this frame.
     * @type {Wick.Tween[]}
     */
    get tweens() {
        // Ensure no tweens are outside of this frame's length.
        var tweens = this.getChildren('Tween')
        tweens.forEach(tween => {
            tween.restrictToFrameSize();
        });

        return this.getChildren('Tween');
    }

    /**
     * True if there are clips or paths on the frame.
     * @type {boolean}
     */
    get contentful () {
        return this.paths.filter(path => {
            return !path.view.item.data._isPlaceholder;
        }).length > 0 || this.clips.length > 0;
    }

    /**
     * The index of the parent layer.
     * @type {number}
     */
    get layerIndex() {
        return this.parentLayer ? this.parentLayer.index : -1;
    }

    /**
     * The index of the layer that this frame last belonged to. Used when copying and pasting frames.
     * @type {number}
     */
    get originalLayerIndex() {
        return this._originalLayerIndex;
    }

    /**
     * Removes this frame from its parent layer.
     */
    remove() {
        this.parent.removeFrame(this);
    }

    /**
     * True if the playhead is on this frame.
     * @param {number} playheadPosition - the position of the playhead.
     * @return {boolean}
     */
    inPosition(playheadPosition) {
        return this.start <= playheadPosition &&
            this.end >= playheadPosition;
    }

    /**
     * True if the frame exists within the given range.
     * @param {number} start - the start of the range to check.
     * @param {number} end - the end of the range to check.
     * @return {boolean}
     */
    inRange(start, end) {
        return this.inPosition(start) ||
            this.inPosition(end) ||
            (this.start >= start && this.start <= end) ||
            (this.end >= start && this.end <= end);
    }

    /**
     * True if the frame is contained fully within a given range.
     * @param {number} start - the start of the range to check.
     * @param {number} end - the end of the range to check.
     * @return {boolean}
     */
    containedWithin(start, end) {
        return this.start >= start && this.end <= end;
    }

    /**
     * The number of frames that this frame is from a given playhead position.
     * @param {number} playheadPosition
     */
    distanceFrom(playheadPosition) {
        // playhead position is inside frame, distance is zero.
        if (this.start <= playheadPosition && this.end >= playheadPosition) {
            return 0;
        }

        // otherwise, find the distance from the nearest end
        if (this.start >= playheadPosition) {
            return this.start - playheadPosition;
        } else if (this.end <= playheadPosition) {
            return playheadPosition - this.end;
        }
    }

    /**
     * Add a clip to the frame.
     * @param {Wick.Clip} clip - the clip to add.
     */
    addClip(clip) {

        if (clip.parent) {
            clip.remove();
        }

        this.addChild(clip);

        // Pre-render the clip's frames
        // (this fixes an issue where clips created from ClipAssets would be "missing" frames)
        clip.timeline.getAllFrames(true).forEach(frame => {
            frame.view.render();
        });
    }

    /**
     * Remove a clip from the frame.
     * @param {Wick.Clip} clip - the clip to remove.
     */
    removeClip(clip) {
        this.removeChild(clip);
    }

    /**
     * Add a path to the frame.
     * @param {Wick.Path} path - the path to add.
     */
    addPath(path) {
        if (path.parent) {
            path.remove();
        }
        this.addChild(path);
    }

    /**
     * Remove a path from the frame.
     * @param {Wick.Path} path - the path to remove.
     */
    removePath(path) {
        this.removeChild(path);
    }

    /**
     * Add a tween to the frame.
     * @param {Wick.Tween} tween - the tween to add.
     */
    addTween(tween) {
        // New tweens eat existing tweens.
        var otherTween = this.getTweenAtPosition(tween.playheadPosition);
        if (otherTween) {
            otherTween.remove();
        }

        this.addChild(tween);
        tween.restrictToFrameSize();
    }

    /**
     * Automatically creates a tween at the current playhead position. Converts all objects into one clip if needed.
     */
    createTween() {
        // Don't make a tween if one already exits
        var playheadPosition = this.getRelativePlayheadPosition();
        if (this.getTweenAtPosition(playheadPosition)) {
            return;
        }

        // If more than one object exists on the frame, or if there is only one path, create a clip from those objects
        var clips = this.clips;
        var paths = this.paths;
        if ((clips.length === 0 && paths.length === 1) || (clips.length + paths.length) > 1) {
            var allDrawables = paths.concat(clips);
            var center = this.project.selection.view._getObjectsBounds(allDrawables).center;
            var clip = new Wick.Clip({
                transformation: new Wick.Transformation({
                    x: center.x,
                    y: center.y,
                }),
            });
            this.addClip(clip);
            clip.addObjects(allDrawables);
        }

        // Create the tween (if there's not already a tween at the current playhead position)
        var clip = this.clips[0];
        this.addTween(new Wick.Tween({
            playheadPosition: playheadPosition,
            transformation: clip ? clip.transformation.copy() : new Wick.Transformation(),
        }));
    }

    /**
     * Remove a tween from the frame.
     * @param {Wick.Tween} tween - the tween to remove.
     */
    removeTween(tween) {
        this.removeChild(tween);
    }

    /**
     * Remove all tweens from this frame.
     */
    removeAllTweens(tween) {
        this.tweens.forEach(tween => {
            tween.remove();
        });
    }

    /**
     * Get the tween at the given playhead position. Returns null if there is no tween.
     * @param {number} playheadPosition - the playhead position to look for tweens at.
     * @returns {Wick.Tween || null} the tween at the given playhead position.
     */
    getTweenAtPosition(playheadPosition) {
        return this.tweens.find(tween => {
            return tween.playheadPosition === playheadPosition;
        }) || null;
    }

    /**
     * Returns the tween at the current playhead position, if one exists on the frame. Null otherwise.
     * @returns {Wick.Tween || null}
     */
    getTweenAtCurrentPlayheadPosition() {
        let playheadPosition = this.getRelativePlayheadPosition();
        return this.getTweenAtPosition(playheadPosition);
    }

    /**
     * The tween being used to transform the objects on the frame.
     * @returns {Wick.Tween || null} tween - the active tween. Null if there is no active tween.
     */
    getActiveTween() {
        if (!this.parentTimeline) return null;

        var playheadPosition = this.getRelativePlayheadPosition();

        var tween = this.getTweenAtPosition(playheadPosition);
        if (tween) {
            return tween;
        }

        var seekBackwardsTween = this.seekTweenBehind(playheadPosition);
        var seekForwardsTween = this.seekTweenInFront(playheadPosition);

        if (seekBackwardsTween && seekForwardsTween) {
           return Wick.Tween.interpolate(seekBackwardsTween, seekForwardsTween, playheadPosition);
        } else if (seekForwardsTween) {
            return seekForwardsTween;
        } else if (seekBackwardsTween) {
            return seekBackwardsTween;
        } else {
            return null;
        }
    }

    /**
     * Applies the transformation of current tween to the objects on the frame.
     */
    applyTweenTransforms() {
        var tween = this.getActiveTween();
        if (tween) {
            this.clips.forEach(clip => {
                tween.applyTransformsToClip(clip);
            });
        }
    }

    /**
     * Applies single frame positions to timelines if necessary.
     */
    applyClipSingleFramePositions () {
        this.clips.forEach(clip => {
            clip.applySingleFramePosition();
        });
    }

    /**
     * Update all clip timelines for their animation type.
     */
    updateClipTimelinesForAnimationType () {
        this.clips.forEach(clip => {
            clip.updateTimelineForAnimationType();
        })
    }

    /**
     * The asset of the sound attached to this frame, if one exists
     * @returns {Wick.Asset[]}
     */
    getLinkedAssets() {
        var linkedAssets = [];

        if (this.sound) {
            linkedAssets.push(this.sound);
        }

        return linkedAssets;
    }

    /**
     * Cut this frame in half using the parent timeline's playhead position.
     */
    cut() {
        // Can't cut a frame that doesn't beolong to a timeline + layer
        if (!this.parentTimeline) return;

        // Can't cut a frame with length 1
        if (this.length === 1) return;

        // Can't cut a frame that isn't under the playhead
        var playheadPosition = this.parentTimeline.playheadPosition;
        if (!this.inPosition(playheadPosition)) return;

        // Create right half (leftover) frame
        var rightHalf = this.copy();
        rightHalf.identifier = null;
        rightHalf.removeSound();
        rightHalf.removeAllTweens();
        rightHalf.start = playheadPosition = playheadPosition;

        // Cut this frame shorter
        this.end = playheadPosition - 1;

        // Add right frame
        this.parentLayer.addFrame(rightHalf);
    }

    /**
     * Extend this frame by one and push all frames right of this frame to the right.
     */
    extendAndPushOtherFrames() {
        this.parentLayer.getFramesInRange(this.end + 1, Infinity).forEach(frame => {
            frame.start += 1;
            frame.end += 1;
        });
        this.end += 1;
    }

    /**
     * Shrink this frame by one and pull all frames left of this frame to the left.
     */
    shrinkAndPullOtherFrames() {
        if (this.length === 1) return;

        this.parentLayer.getFramesInRange(this.end + 1, Infinity).forEach(frame => {
            frame.start -= 1;
            frame.end -= 1;
        });
        this.end -= 1;
    }

    /**
     * Import SVG data into this frame. SVGs containing mulitple paths will be split into multiple Wick Paths.
     * @param {string} svg - the SVG data to parse and import.
     */
    /*
    importSVG (svg) {
        this.view.importSVG(svg);
    }
    */
    /**
     * Get the position of this frame in relation to the parent timeline's playhead position.
     * @returns {number}
     */
    getRelativePlayheadPosition() {
        return this.parentTimeline.playheadPosition - this.start + 1;
    }

    /**
     * Find the first tween on this frame that exists behind the given playhead position.
     * @returns {Wick.Tween}
     */
    seekTweenBehind(playheadPosition) {
        var seekBackwardsPosition = playheadPosition;
        var seekBackwardsTween = null;
        while (seekBackwardsPosition > 0) {
            seekBackwardsTween = this.getTweenAtPosition(seekBackwardsPosition);
            seekBackwardsPosition--;
            if (seekBackwardsTween) break;
        }
        return seekBackwardsTween;
    }

    /**
     * Find the first tween on this frame that exists past the given playhead position.
     * @returns {Wick.Tween}
     */
    seekTweenInFront(playheadPosition) {
        var seekForwardsPosition = playheadPosition;
        var seekForwardsTween = null;
        while (seekForwardsPosition <= this.end) {
            seekForwardsTween = this.getTweenAtPosition(seekForwardsPosition);
            seekForwardsPosition++;
            if (seekForwardsTween) break;
        }
        return seekForwardsTween;
    }

    _onInactive() {
        super._onInactive();
        this._tickChildren();
    }

    _onActivated() {
        super._onActivated();
        this.playSound();
        this._tickChildren();
    }

    _onActive() {
        super._onActive();
        this._tickChildren();
    }

    _onDeactivated() {
        super._onDeactivated();
        this.stopSound();
        this._tickChildren();
    }

    _tickChildren() {
        this.clips.forEach(clip => {
            clip.tick();
        });
    }

    _attachChildClipReferences() {
        this.clips.forEach(clip => {
            if (clip.identifier) {
                this[clip.identifier] = clip;
                clip._attachChildClipReferences();
            }
        });
    }
}
