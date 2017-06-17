import zeroFill from '../utils/zero-fill';
import { createDuration } from '../duration/create';
import { addSubtract } from '../moment/add-subtract';
import { Moment, isMoment, copyConfig } from '../moment/constructor';
import { addFormatToken } from '../format/format';
import { addRegexToken, matchOffset, matchShortOffset } from '../parse/regex';
import { addParseToken } from '../parse/token';
import { createLocal } from '../create/local';
import { quickCreateLocal, quickCreateUTC } from '../create/from-anything';
import { createUTC } from '../create/utc';
import isDate from '../utils/is-date';
import toInt from '../utils/to-int';
import isUndefined from '../utils/is-undefined';
import compareArrays from '../utils/compare-arrays';
import { hooks } from '../utils/hooks';

// FORMATTING

function offset (token, separator) {
    addFormatToken(token, 0, 0, function () {
        var offset = this.utcOffset();
        var sign = '+';
        if (offset < 0) {
            offset = -offset;
            sign = '-';
        }
        return sign + zeroFill(~~(offset / 60), 2) + separator + zeroFill(~~(offset) % 60, 2);
    });
}

offset('Z', ':');
offset('ZZ', '');

// PARSING

addRegexToken('Z',  matchShortOffset);
addRegexToken('ZZ', matchShortOffset);
addParseToken(['Z', 'ZZ'], function (input, array, config) {
    config._tzm = offsetFromString(matchShortOffset, input);
});

// HELPERS

// timezone chunker
// '+10:00' > ['10',  '00']
// '-1530'  > ['-15', '30']
var chunkOffset = /([\+\-]|\d\d)/gi;

function offsetFromString(matcher, string) {
    var matches = (string || '').match(matcher);

    if (matches === null) {
        return null;
    }

    var chunk   = matches[matches.length - 1] || [];
    var parts   = (chunk + '').match(chunkOffset) || ['-', 0, 0];
    var minutes = +(parts[1] * 60) + toInt(parts[2]);

    return minutes === 0 ?
      0 :
      parts[0] === '+' ? minutes : -minutes;
}

// Return a moment from input, that is local/utc/zone equivalent to model.
export function cloneWithOffset(input, model) {
    // TODO: input could be a non-moment object, in certain cases
    // createLocal("....z") --> is this UTC?
    return changeTimezone(input, model._tz);
}

function getDateOffset (m) {
    // On Firefox.24 Date#getTimezoneOffset returns a floating point.
    // https://github.com/moment/moment/pull/1871
    return -Math.round(m._d.getTimezoneOffset() / 15) * 15;
}

// HOOKS

// This function will be called whenever a moment is mutated.
// It is intended to keep the offset in sync with the timezone.
//
// Because Moment's external API is immutable and this hook will be defined
// externally (e.g. by Moment Timezone), this hook must return a (possibly new)
// Moment instance that reflects the correctly-updated offset.
// hooks.updateOffset = function (m) {
//     return m;
// };
// TODO: Fix usages, if any

// MOMENTS

// keepLocalTime = true means only change the timezone, without
// affecting the local hour. So 5:31:26 +0300 --[utcOffset(2, true)]-->
// 5:31:26 +0200 It is possible that 5:31:26 doesn't exist with offset
// +0200, so we adjust the time as needed, to be valid.
//
// Keeping the time actually adds/subtracts (one hour)
// from the actual represented time. That is why we call updateOffset
// a second time. In case it wants us to change the offset again
// _changeInProgress == true case, then we have to adjust, because
// there is no such time in the given timezone.

function changeTimezone(mom, newTz, keepLocalTime) {
    // TODO: Check if newTz is same as current (by comparing zone._key or sth)
    // -- it is used a lot with possibly same tz (from cloneWithOffset)
    if (keepLocalTime) {
        return quickCreateLocal(mom._d.valueOf(), mom._l, newTz);
    } else {
        return quickCreateUTC(mom.unix(), mom._l, newTz);
    }
}

export function getSetOffset (input, keepLocalTime, keepMinutes) {
    if (input != null) {
        if (typeof input === 'string') {
            input = offsetFromString(matchShortOffset, input);
            if (input === null) {
                return mom;
            }
        } else if (Math.abs(input) < 16 && !keepMinutes) {
            input = input * 60;
        }
        // not sure we need this no-op case, for speed I guess
        // if (this._tz.type === 'fixed-offset' && this._tz.offset === input) {
        //     return mom;
        // }
        var newTz = FixedOffsetTimeZone.fromOffset(input);
        return changeTimezone(this, newTz, keepLocalTime);
    } else {
        return this._offset / 60000;
    }
}



// export function getSetOffset (input, keepLocalTime, keepMinutes) {
//     var mom = this,
//         offset = mom._offset || 0,
//         localAdjust;
//     if (!mom.isValid()) {
//         return input != null ? mom : NaN;
//     }
//     if (input != null) {
//         if (typeof input === 'string') {
//             input = offsetFromString(matchShortOffset, input);
//             if (input === null) {
//                 return mom;
//             }
//         } else if (Math.abs(input) < 16 && !keepMinutes) {
//             input = input * 60;
//         }
//         if (!mom._isUTC && keepLocalTime) {
//             localAdjust = getDateOffset(mom);
//         }
//         // TODOv3 -- the new zone api should support 'is valid' that checks for
//         // a 'hole', and maybe ambiguity (overlap). This logic could be reorganized
//         // afterwards.
//         mom = new Moment(mom);
//         mom._offset = input;
//         mom._isUTC = true;
//         if (localAdjust != null) {
//             mom = mom.add(localAdjust, 'm');
//         }
//         if (offset !== input) {
//             if (!keepLocalTime || mom._changeInProgress) {
//                 mom = addSubtract(mom, createDuration(input - offset, 'm'), 1, false);
//             } else if (!mom._changeInProgress) {
//                 mom._changeInProgress = true;
//                 mom = hooks.updateOffset(mom, true);
//                 mom._changeInProgress = null;
//             }
//         }
//         return mom;
//     } else {
//         return mom._isUTC ? offset : getDateOffset(mom);
//     }
// }

export function getSetZone (input, keepLocalTime) {
    if (input != null) {
        if (typeof input !== 'string') {
            input = -input;
        }

        return this.utcOffset(input, keepLocalTime);
    } else {
        return -this.utcOffset();
    }
}

export function setOffsetToUTC (keepLocalTime) {
    return changeTimezone(this, FixedOffsetTimeZone.fromOffset(0), keepLocalTime);
}

export function setOffsetToLocal (keepLocalTime) {
    return changeTimezone(this, LocalTimeZone.instance(), keepLocalTime);
}

export function setOffsetToParsedOffset () {
    if (this._tzm != null) {
        return this.utcOffset(this._tzm, false, true);
    } else if (typeof this._i === 'string') {
        var tZone = offsetFromString(matchOffset, this._i);
        if (tZone != null) {
            return this.utcOffset(tZone);
        }
        else {
            return this.utcOffset(0, true);
        }
        return this.utcOffset(offsetFromString(matchOffset, this._i));
    }
    return this;
}

export function hasAlignedHourOffset (input) {
    if (!this.isValid()) {
        return false;
    }
    input = input ? createLocal(input).utcOffset() : 0;

    return (this.utcOffset() - input) % 60 === 0;
}

export function isDaylightSavingTime () {
    return (
        this.utcOffset() > this.month(0).utcOffset() ||
        this.utcOffset() > this.month(5).utcOffset()
    );
}

// TODO: We could do this properly, but I don't think we should.
// Maybe expose the local -> [local, offset] function and let people shoot
// themselves in the foot
// export function isDaylightSavingTimeShifted () {
//     if (!isUndefined(this._isDSTShifted)) {
//         return this._isDSTShifted;
//     }

//     var c = {};

//     copyConfig(c, this);
//     c = prepareConfig(c);

//     if (c._a) {
//         var other = c._isUTC ? createUTC(c._a) : createLocal(c._a);
//         this._isDSTShifted = this.isValid() &&
//             compareArrays(c._a, other.toArray()) > 0;
//     } else {
//         this._isDSTShifted = false;
//     }

//     return this._isDSTShifted;
// }

export function isLocal () {
    return this._tz.type == 'local';
}

export function isUtcOffset () {
    return this._tz.type == 'fixed-offset';
}

export function isUtc () {
    return this._tz.type == 'fixed-offset' && this._tz.offset === 0;
}
