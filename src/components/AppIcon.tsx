import type { ComponentType } from 'react';
import type { ColorValue } from 'react-native';
import { View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import AlertIcon from '../../assets/icons/svg/alert.svg';
import AnimalTabIcon from '../../assets/icons/svg/animal_.svg';
import ArrowRightCircleIcon from '../../assets/icons/svg/arrow-right-circle.svg';
import ArrowRightIcon from '../../assets/icons/svg/arrow-right.svg';
import AlpacaIcon from '../../assets/icons/svg/alpaca.svg';
import Animals3Icon from '../../assets/icons/svg/animals3.svg';
import BackIcon from '../../assets/icons/svg/back.svg';
import BisonIcon from '../../assets/icons/svg/bison.svg';
import CamelIcon from '../../assets/icons/svg/camel.svg';
import CameraIcon from '../../assets/icons/svg/camera.svg';
import CheckCircleIcon from '../../assets/icons/svg/check-circle.svg';
import CheckIcon from '../../assets/icons/svg/check.svg';
import ChickenIcon from '../../assets/icons/svg/chicken.svg';
import ChevronDownIcon from '../../assets/icons/svg/chevron-down.svg';
import ChevronRightIcon from '../../assets/icons/svg/chevron-right.svg';
import CloseIcon from '../../assets/icons/svg/close.svg';
import Cow3Icon from '../../assets/icons/svg/cow3.svg';
import CowHeadIcon from '../../assets/icons/svg/cow-head.svg';
import CowCopyIcon from '../../assets/icons/svg/cow copy.svg';
import CowIcon from '../../assets/icons/svg/cow.svg';
import CrownIcon from '../../assets/icons/svg/crown.svg';
import DonkeyIcon from '../../assets/icons/svg/donkey.svg';
import DuckIcon from '../../assets/icons/svg/duck.svg';
import EditIcon from '../../assets/icons/svg/edit-outline.svg';
import ExportIcon from '../../assets/icons/svg/export.svg';
import ExportTabIcon from '../../assets/icons/svg/export_.svg';
import ExportFileDownloadOutlineIcon from '../../assets/icons/svg/export-file-download-outline.svg';
import ExportFileOutlineIcon from '../../assets/icons/svg/export-file-outline.svg';
import FilterListIcon from '../../assets/icons/svg/filter-list.svg';
import GoatFaceIcon from '../../assets/icons/goat.svg';
import GoatIcon from '../../assets/icons/svg/goat.svg';
import GooseIcon from '../../assets/icons/svg/goose.svg';
import GlobeIcon from '../../assets/icons/svg/globe.svg';
import GroupIcon from '../../assets/icons/svg/group.svg';
import HorseIcon from '../../assets/icons/svg/horse.svg';
import InfoIcon from '../../assets/icons/svg/info.svg';
import LlamaIcon from '../../assets/icons/svg/llama.svg';
import MedicineIcon from '../../assets/icons/svg/medicine.svg';
import MenuIcon from '../../assets/icons/svg/menu.svg';
import OstrichIcon from '../../assets/icons/svg/ostrich.svg';
import PigIcon from '../../assets/icons/svg/pig.svg';
import Pig2Icon from '../../assets/icons/svg/pig2.svg';
import PinIcon from '../../assets/icons/svg/pin.svg';
import PlusIcon from '../../assets/icons/svg/plus.svg';
import ProfileIcon from '../../assets/icons/svg/profile.svg';
import RabbitIcon from '../../assets/icons/svg/rabbit.svg';
import RecordsBookIcon from '../../assets/icons/svg/records-book.svg';
import RecordsIcon from '../../assets/icons/svg/records.svg';
import RecordsTabIcon from '../../assets/icons/svg/records_.svg';
import SearchIcon from '../../assets/icons/svg/search.svg';
import ShareIcon from '../../assets/icons/svg/share.svg';
import Setup4Icon from '../../assets/icons/svg/setup4.svg';
import SetupOutlineIcon from '../../assets/icons/svg/setup-outline.svg';
import SpannerIcon from '../../assets/icons/svg/spanner.svg';
import SpannerTabIcon from '../../assets/icons/svg/spanner_.svg';
import Spanner2Icon from '../../assets/icons/svg/spanner2.svg';
import MailIcon from '../../assets/icons/svg/mail.svg';
import MedalIcon from '../../assets/icons/svg/medal.svg';
import SheepIcon from '../../assets/icons/svg/sheep.svg';
import SproutIcon from '../../assets/icons/svg/sprout.svg';
import TagIcon from '../../assets/icons/svg/tag.svg';
import TrashIcon from '../../assets/icons/svg/trash.svg';
import ToolsIcon from '../../assets/icons/svg/tools.svg';
import TurkeyIcon from '../../assets/icons/svg/turkey.svg';
import WebPortalIcon from '../../assets/icons/svg/web_portal.svg';
import NotebookIcon from '../../assets/icons/svg/notebook.svg';
import SaveIcon from '../../assets/icons/svg/save.svg';
import ImageAddIcon from '../../assets/icons/svg/image-add.svg';
import FemaleIcon from '../../assets/icons/svg/female.svg';
import MaleIcon from '../../assets/icons/svg/male.svg';
import ArrowRightCircleIconFilled from '../../assets/icons/svg/arrow-right-circle.svg';
import EnterArrowIcon from '../../assets/icons/svg/enter-arrow.svg';

const icons = {
  alert: AlertIcon,
  animal_: AnimalTabIcon,
  alpaca: AlpacaIcon,
  animals: CowHeadIcon,
  animals3: Animals3Icon,
  'animals-outline': Animals3Icon,
  'arrow-right': ArrowRightIcon,
  'arrow-right-circle': ArrowRightCircleIcon,
  'arrow-right-circle-filled': ArrowRightCircleIconFilled,
  back: BackIcon,
  bison: BisonIcon,
  camel: CamelIcon,
  camera: CameraIcon,
  'check-circle': CheckCircleIcon,
  check: CheckIcon,
  chicken: ChickenIcon,
  'chevron-down': ChevronDownIcon,
  'chevron-right': ChevronRightIcon,
  close: CloseIcon,
  cow3: Cow3Icon,
  cow: CowIcon,
  'cow-copy': CowCopyIcon,
  'cow-outline': Cow3Icon,
  'cow-head': CowHeadIcon,
  'cow-head-outline': CowHeadIcon,
  crown: CrownIcon,
  donkey: DonkeyIcon,
  duck: DuckIcon,
  edit: EditIcon,
  export: ExportIcon,
  export_: ExportTabIcon,
  'export-download-outline': ExportFileDownloadOutlineIcon,
  'export-outline': ExportFileOutlineIcon,
  'enter-arrow': EnterArrowIcon,
  female: FemaleIcon,
  filter: MenuIcon,
  'goat-face': GoatFaceIcon,
  goat: GoatIcon,
  goose: GooseIcon,
  globe: GlobeIcon,
  group: GroupIcon,
  horse: HorseIcon,
  'image-add': ImageAddIcon,
  info: InfoIcon,
  llama: LlamaIcon,
  mail: MailIcon,
  medal: MedalIcon,
  male: MaleIcon,
  medicine: MedicineIcon,
  notebook: NotebookIcon,
  ostrich: OstrichIcon,
  pig: PigIcon,
  pig2: Pig2Icon,
  pin: PinIcon,
  plus: PlusIcon,
  profile: ProfileIcon,
  rabbit: RabbitIcon,
  'records-book': RecordsBookIcon,
  records: RecordsIcon,
  records_: RecordsTabIcon,
  save: SaveIcon,
  search: SearchIcon,
  settings: Spanner2Icon,
  share: ShareIcon,
  setup4: Setup4Icon,
  'setup-outline': SetupOutlineIcon,
  spanner: SpannerIcon,
  spanner_: SpannerTabIcon,
  spanner2: Spanner2Icon,
  sheep: SheepIcon,
  sprout: SproutIcon,
  tag: TagIcon,
  trash: TrashIcon,
  tools: ToolsIcon,
  turkey: TurkeyIcon,
  web_portal: WebPortalIcon,
} satisfies Record<string, ComponentType<SvgProps>>;

export type AppIconName = keyof typeof icons;

type AppIconProps = {
  name: AppIconName;
  size?: number;
  opacity?: number;
  color?: ColorValue;
};

const mirroredIcons = new Set<AppIconName>(['sheep']);

export function AppIcon({ name, size = 22, opacity = 1, color }: AppIconProps) {
  const Icon = icons[name];
  const icon = <Icon width={size} height={size} opacity={opacity} color={color} fill={color} />;

  if (mirroredIcons.has(name)) {
    return <View style={{ transform: [{ scaleX: -1 }] }}>{icon}</View>;
  }

  return icon;
}
